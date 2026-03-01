# AI EDA Browser-Native Architecture

## Target Folder Structure

```text
/frontend
  /src
    /engine
      /graph
      /validation
      /constraints
      /parameters
    /canvas
    /workers
    /store
    /persistence
    /ai-integration
    /sync

/backend
  /app
    /routers
    /services
    /ai
    /pcb
    /bom
    /firmware
```

## Frontend Responsibilities

- Own circuit graph lifecycle: nodes, pins, nets, edges, voltage domains.
- Run deterministic electrical validation locally in TypeScript.
- Execute heavy computation in Web Workers (`VALIDATE`, `MERGE_NETS`, `ANALYZE_CURRENT`).
- Render via PixiJS/WebGL with incremental updates and independent render loop.
- Persist local project state to IndexedDB with autosave and snapshots.
- Integrate AI outputs as structured suggestions with explicit preview/commit.

## Backend Responsibilities

- AI orchestration and structured payload generation.
- Project/circuit persistence and snapshot save endpoint.
- Manufacturing outputs (BOM, PCB/Gerber, firmware stubs).
- Authentication and sync transport.

## Removed From Backend

- Deterministic circuit validation engine.
- Backend validation router.
- Electrical rule execution path.

## Migration Strategy

1. Freeze backend validation endpoints and deprecate clients.
2. Route all graph edits to frontend operation dispatcher.
3. Validate locally after each graph operation (worker-backed for large graphs).
4. Save snapshots with explicit backend snapshot endpoint.
5. Roll out AI suggestion preview flow as default write path.
6. Keep WebSocket sync transport stateless for operation diffs.

## Scaling Notes (2000+ Nodes)

- Keep normalized graph state (dictionary by ID).
- Use dirty IDs to update only changed render objects.
- Push graph traversal and merge operations to workers.
- Keep canvas render loop independent from React rerenders.
- Batch state operations through reducer dispatch.
