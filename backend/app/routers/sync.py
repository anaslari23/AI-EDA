"""Collaborative sync — WebSocket handler with room management.

Multi-user real-time sync using state diffs.
Server stores authoritative version and broadcasts diffs to all peers.
CRDT conflict resolution happens on the client; server forwards all diffs.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


# ─── Peer ───


@dataclass
class Peer:
    peer_id: str
    display_name: str
    color: str
    websocket: WebSocket
    joined_at: float = field(default_factory=time.time)

    def to_info(self) -> dict:
        return {
            "peerId": self.peer_id,
            "displayName": self.display_name,
            "color": self.color,
            "joinedAt": int(self.joined_at * 1000),
        }


# ─── Room ───


@dataclass
class Room:
    circuit_id: str
    peers: dict[str, Peer] = field(default_factory=dict)
    state: dict = field(default_factory=dict)
    version: int = 0
    clock: dict = field(
        default_factory=lambda: {
            "wall": int(time.time() * 1000),
            "logical": 0,
            "peerId": "server",
        }
    )

    def tick_clock(self) -> dict:
        now = int(time.time() * 1000)
        if now > self.clock["wall"]:
            self.clock = {"wall": now, "logical": 0, "peerId": "server"}
        else:
            self.clock["logical"] += 1
        return {**self.clock}

    def merge_clock(self, remote: dict) -> dict:
        now = int(time.time() * 1000)
        max_wall = max(now, self.clock["wall"], remote.get("wall", 0))
        logical = 0
        if max_wall == self.clock["wall"] == remote.get("wall", 0):
            logical = max(self.clock["logical"], remote.get("logical", 0)) + 1
        elif max_wall == self.clock["wall"]:
            logical = self.clock["logical"] + 1
        elif max_wall == remote.get("wall", 0):
            logical = remote.get("logical", 0) + 1
        self.clock = {"wall": max_wall, "logical": logical, "peerId": "server"}
        return {**self.clock}


# ─── Room Manager ───


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, Room] = {}

    def get_or_create(self, circuit_id: str) -> Room:
        if circuit_id not in self.rooms:
            self.rooms[circuit_id] = Room(circuit_id=circuit_id)
        return self.rooms[circuit_id]

    def remove_peer(self, circuit_id: str, peer_id: str) -> None:
        room = self.rooms.get(circuit_id)
        if room:
            room.peers.pop(peer_id, None)
            if not room.peers:
                # Keep room state for reconnects, but could clean up after timeout
                pass

    def cleanup_empty(self) -> None:
        empty = [cid for cid, room in self.rooms.items() if not room.peers]
        for cid in empty:
            del self.rooms[cid]


rooms = RoomManager()


# ─── WebSocket Endpoint ───


@router.websocket("/ws/sync")
async def sync_websocket(
    websocket: WebSocket,
    circuitId: str = "",
    peerId: str = "",
    name: str = "Anonymous",
    color: str = "#4FC3F7",
):
    if not circuitId or not peerId:
        await websocket.close(code=4000, reason="Missing circuitId or peerId")
        return

    await websocket.accept()

    room = rooms.get_or_create(circuitId)
    peer = Peer(
        peer_id=peerId,
        display_name=name,
        color=color,
        websocket=websocket,
    )
    room.peers[peerId] = peer

    # Notify existing peers
    join_msg = json.dumps(
        {
            "type": "PEER_JOIN",
            "peer": peer.to_info(),
        }
    )
    for pid, p in room.peers.items():
        if pid != peerId:
            try:
                await p.websocket.send_text(join_msg)
            except Exception:
                pass

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "SYNC_REQUEST_FULL":
                await handle_request_full(room, peer)

            elif msg_type == "SYNC_PUSH":
                await handle_push(room, peer, msg)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        rooms.remove_peer(circuitId, peerId)

        # Notify remaining peers
        leave_msg = json.dumps(
            {
                "type": "PEER_LEAVE",
                "peerId": peerId,
            }
        )
        for p in room.peers.values():
            try:
                await p.websocket.send_text(leave_msg)
            except Exception:
                pass


# ─── Message Handlers ───


async def handle_request_full(room: Room, peer: Peer) -> None:
    """Send full authoritative state to requesting peer."""
    msg = json.dumps(
        {
            "type": "SYNC_FULL_STATE",
            "circuitId": room.circuit_id,
            "version": room.version,
            "state": room.state,
            "clock": room.clock,
            "connectedPeers": [p.to_info() for p in room.peers.values()],
        }
    )
    await peer.websocket.send_text(msg)


async def handle_push(room: Room, peer: Peer, msg: dict) -> None:
    """Apply diffs from a peer and broadcast to others."""
    diffs = msg.get("diffs", [])
    remote_clock = msg.get("clock", {})

    if not diffs:
        return

    # Merge server clock with remote
    merged_clock = room.merge_clock(remote_clock)

    # Apply diffs to authoritative state
    accepted_diffs = []
    rejected_paths = []

    for diff in diffs:
        path = diff.get("path", "")
        op = diff.get("op", "")

        try:
            if op == "add" or op == "update":
                _set_path(room.state, path, diff.get("value"))
                accepted_diffs.append(diff)
            elif op == "remove":
                _del_path(room.state, path)
                accepted_diffs.append(diff)
            else:
                rejected_paths.append(path)
        except Exception:
            rejected_paths.append(path)

    room.version += 1

    # Send ACK to sender
    ack = json.dumps(
        {
            "type": "SYNC_ACK",
            "version": room.version,
            "clock": merged_clock,
            "acceptedCount": len(accepted_diffs),
            "rejectedPaths": rejected_paths,
        }
    )
    try:
        await peer.websocket.send_text(ack)
    except Exception:
        pass

    # Broadcast accepted diffs to other peers
    if accepted_diffs:
        pull_msg = json.dumps(
            {
                "type": "SYNC_PULL",
                "circuitId": room.circuit_id,
                "sourcePeerId": peer.peer_id,
                "clock": merged_clock,
                "diffs": accepted_diffs,
                "version": room.version,
            }
        )
        for pid, p in room.peers.items():
            if pid != peer.peer_id:
                try:
                    await p.websocket.send_text(pull_msg)
                except Exception:
                    pass


# ─── Path Utilities ───


def _set_path(obj: dict, path: str, value) -> None:
    """Set a nested value by dot-path."""
    parts = path.split(".")
    current = obj
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def _del_path(obj: dict, path: str) -> None:
    """Delete a nested value by dot-path."""
    parts = path.split(".")
    current = obj
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            return
        current = current[part]
    current.pop(parts[-1], None)
