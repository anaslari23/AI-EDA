import { useMemo, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import type { CanvasNode, Pin } from '../canvas/types';

interface PinOption {
  nodeId: string;
  pinId: string;
  nodeLabel: string;
  pinLabel: string;
  direction: Pin['direction'];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_]+/g, ' ').trim();
}

function splitConnectionPrompt(prompt: string): [string, string] | null {
  const raw = prompt.trim();
  const arrowMatch = raw.match(/(.+?)(?:\s+to\s+|->|=>)(.+)/i);
  if (!arrowMatch) return null;
  return [arrowMatch[1].trim(), arrowMatch[2].trim()];
}

function makePinOptions(nodes: CanvasNode[]): PinOption[] {
  const options: PinOption[] = [];
  for (const node of nodes) {
    for (const pin of node.pins) {
      options.push({
        nodeId: node.id,
        pinId: pin.id,
        nodeLabel: node.label,
        pinLabel: pin.label,
        direction: pin.direction,
      });
    }
  }
  return options;
}

function scoreOption(option: PinOption, target: string): number {
  const needle = normalize(target);
  if (!needle) return 0;

  const pin = normalize(option.pinLabel);
  const node = normalize(option.nodeLabel);
  const combo = `${node} ${pin}`;

  if (combo === needle) return 120;
  if (pin === needle) return 110;
  if (combo.includes(needle)) return 90;
  if (pin.includes(needle)) return 85;

  const parts = needle.split(' ').filter(Boolean);
  let score = 0;
  for (const part of parts) {
    if (pin.includes(part)) score += 35;
    if (node.includes(part)) score += 15;
  }
  return score;
}

function pickBest(options: PinOption[], target: string, mode: 'source' | 'target'): PinOption | null {
  const filtered = options.filter((option) => {
    if (mode === 'source') {
      return option.direction === 'output' || option.direction === 'bidirectional' || option.direction === 'power';
    }
    return option.direction === 'input' || option.direction === 'bidirectional' || option.direction === 'ground';
  });

  let best: PinOption | null = null;
  let bestScore = 0;

  for (const option of filtered) {
    const score = scoreOption(option, target);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }

  return bestScore >= 35 ? best : null;
}

export default function AIWireAssist() {
  const nodes = useCanvasStore((s) => s.nodes);
  const startWire = useCanvasStore((s) => s.startWire);
  const finishWire = useCanvasStore((s) => s.finishWire);

  const [prompt, setPrompt] = useState('');
  const [sourcePinId, setSourcePinId] = useState('');
  const [targetPinId, setTargetPinId] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const options = useMemo(() => makePinOptions(nodes), [nodes]);

  const sourceOptions = useMemo(
    () => options.filter((o) => o.direction === 'output' || o.direction === 'bidirectional' || o.direction === 'power'),
    [options],
  );

  const targetOptions = useMemo(
    () => options.filter((o) => o.direction === 'input' || o.direction === 'bidirectional' || o.direction === 'ground'),
    [options],
  );

  const connect = (srcId: string, dstId: string) => {
    const src = options.find((o) => o.pinId === srcId);
    const dst = options.find((o) => o.pinId === dstId);
    if (!src || !dst) {
      setStatus('Could not find selected pins.');
      return;
    }

    if (src.nodeId === dst.nodeId) {
      setStatus('Cannot connect pins on the same component.');
      return;
    }

    startWire(src.pinId, src.nodeId);
    finishWire(dst.pinId, dst.nodeId);
    setStatus(`Connected ${src.nodeLabel}.${src.pinLabel} -> ${dst.nodeLabel}.${dst.pinLabel}`);
  };

  const autoMatch = () => {
    const parts = splitConnectionPrompt(prompt);
    if (!parts) {
      setStatus('Use format: "connect <output> to <input>".');
      return;
    }

    const [srcText, dstText] = parts;
    const src = pickBest(options, srcText, 'source');
    const dst = pickBest(options, dstText, 'target');

    if (!src || !dst) {
      setStatus('Could not confidently match both pins. Select manually below.');
      return;
    }

    setSourcePinId(src.pinId);
    setTargetPinId(dst.pinId);
    setStatus(`Matched ${src.nodeLabel}.${src.pinLabel} -> ${dst.nodeLabel}.${dst.pinLabel}`);
  };

  const handleConnect = () => {
    if (!sourcePinId || !targetPinId) {
      setStatus('Pick source and target pins first.');
      return;
    }
    connect(sourcePinId, targetPinId);
  };

  return (
    <div className="ai-wire-assist">
      <h3 className="ai-wire-assist__title">AI Wire Assist</h3>
      <p className="ai-wire-assist__hint">Connect desired output to input using prompt or manual pick.</p>

      <textarea
        className="ai-wire-assist__textarea"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="connect mcu gpio21 to bme280 sda"
      />

      <button className="ai-wire-assist__button" onClick={autoMatch} disabled={!prompt.trim() || nodes.length === 0}>
        Suggest Pins
      </button>

      <div className="ai-wire-assist__grid">
        <label className="ai-wire-assist__label">Source (output)</label>
        <select value={sourcePinId} onChange={(e) => setSourcePinId(e.target.value)} className="ai-wire-assist__select">
          <option value="">Select output pin</option>
          {sourceOptions.map((option) => (
            <option key={option.pinId} value={option.pinId}>
              {option.nodeLabel}.{option.pinLabel}
            </option>
          ))}
        </select>

        <label className="ai-wire-assist__label">Target (input)</label>
        <select value={targetPinId} onChange={(e) => setTargetPinId(e.target.value)} className="ai-wire-assist__select">
          <option value="">Select input pin</option>
          {targetOptions.map((option) => (
            <option key={option.pinId} value={option.pinId}>
              {option.nodeLabel}.{option.pinLabel}
            </option>
          ))}
        </select>
      </div>

      <button className="ai-wire-assist__button ai-wire-assist__button--connect" onClick={handleConnect}>
        Connect Wire
      </button>

      {status && <div className="ai-wire-assist__status">{status}</div>}
    </div>
  );
}
