'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  Edge,
  Node,
  NodeChange,
  EdgeChange,
  Panel
} from 'reactflow';
import 'reactflow/dist/style.css';
import { X, Save, Plus } from 'lucide-react';

import { TriggerNode, ConditionNode, ActionNode, EndNode } from './Nodes';
import { WORKFLOW_STATES, LEAD_FIELDS, FIELD_VALUES } from '@/lib/constants';

const nodeTypes = {
  triggerNode: TriggerNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
  endNode: EndNode,
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'triggerNode',
    position: { x: 250, y: 50 },
    data: { label: 'State: wa_pending', state: 'wa_pending' },
  },
  {
    id: '2',
    type: 'conditionNode',
    position: { x: 250, y: 200 },
    data: { label: 'lead_source == Meta Ads', field: 'lead_source', value: 'Meta Ads' },
  },
  {
    id: '3',
    type: 'actionNode',
    position: { x: 100, y: 350 },
    data: { label: 'Send Template: wa_welcome_meta', templateName: 'wa_welcome_meta' },
  },
  {
    id: '4',
    type: 'actionNode',
    position: { x: 400, y: 350 },
    data: { label: 'Send Template: wa_welcome_organic', templateName: 'wa_welcome_organic' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3', sourceHandle: 'true', label: 'Yes' },
  { id: 'e2-4', source: '2', target: '4', sourceHandle: 'false', label: 'No' },
];

export default function LogicBuilderCanvas() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [twilioTemplates, setTwilioTemplates] = useState<{ sid: string; name: string }[]>([]);

  useEffect(() => {
    // Load saved workflow from DB (replaces the hardcoded initial graph)
    fetch('/api/admin/workflow')
      .then((r) => r.json())
      .then((data) => {
        if (data.nodes && data.edges) {
          setNodes(data.nodes);
          setEdges(data.edges);
        }
      })
      .catch((err) => console.error('[LogicBuilder] Failed to load workflow:', err));

    // Load approved templates for the action node dropdown
    fetch('/api/admin/templates')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setTwilioTemplates(data))
      .catch((err) => console.error('[LogicBuilder] Failed to load templates:', err));
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const updateNodeData = (id: string, newData: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          const combinedData = { ...node.data, ...newData };
          // Compute new label based on type
          let label = node.data.label;
          if (node.type === 'triggerNode') {
            label = `State: ${combinedData.state || ''}`;
          } else if (node.type === 'conditionNode') {
            label = `${combinedData.field || ''} == ${combinedData.value || ''}`;
          } else if (node.type === 'actionNode') {
            label = `Send Template: ${combinedData.templateName || ''}`;
          }

          return {
            ...node,
            data: { ...combinedData, label },
          };
        }
        return node;
      })
    );
  };

  const addNode = (type: string) => {
    const id = `${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: 100, y: 100 },
      data: { label: `New ${type}` },
    };
    if (type === 'triggerNode') newNode.data.state = WORKFLOW_STATES[0];
    if (type === 'conditionNode') {
      newNode.data.field = LEAD_FIELDS[0].id;
      newNode.data.value = FIELD_VALUES[LEAD_FIELDS[0].id]?.[0] ?? '';
    }
    if (type === 'actionNode') newNode.data.templateName = twilioTemplates[0]?.name ?? '';

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      });

      if (!response.ok) throw new Error('Failed to save workflow');
      alert('Workflow rules published successfully!');
    } catch (error) {
      console.error(error);
      alert('Failed to save workflow.');
    } finally {
      setIsSaving(false);
    }
  };

  const templateOptions = twilioTemplates.map((t) => t.name);

  return (
    <div className="h-screen w-full flex flex-col font-sans">
      {/* Header */}
      <div className="bg-white border-b py-3 px-6 flex justify-between items-center shadow-sm z-20">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent italic">Logic Builder</h1>
          <p className="text-xs text-gray-500">Design automated engagement flows</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-full font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2"
        >
          <Save size={18} />
          {isSaving ? 'Saving...' : 'Save & Publish'}
        </button>
      </div>

      {/* UTILITY first-touch override notice — the rules engine swaps the final template
          at send time; the graph's routing/filters still apply, its template is fallback. */}
      {twilioTemplates.some((t) => t.name === 'wa_enquiry_received') && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-xs text-emerald-900 z-10 flex items-center gap-2">
          <span className="font-bold uppercase tracking-wide text-emerald-700">First-touch override active</span>
          <span>
            Every new lead receives <code className="font-mono bg-emerald-100 px-1 rounded">wa_enquiry_received</code> (UTILITY · ~100% delivery)
            as their first message, before this graph runs. The graph below only decides filtering (End/Stop → manual triage) — its “Send Template”
            actions are fallback, used solely if the utility template loses Meta approval.
          </span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        {/* Canvas Area */}
        <div className="flex-1 relative bg-gray-50">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background color="#ddd" gap={20} />
            <Controls />
            <Panel position="top-left" className="bg-white/80 backdrop-blur p-4 rounded-xl shadow-lg border border-white m-4 flex flex-col gap-3">
              <div className="text-[10px] uppercase tracking-widest font-bold text-gray-400">Inventory</div>
              <div className="flex gap-2">
                <button onClick={() => addNode('triggerNode')} title="Add Trigger" className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors shadow-sm"><Plus size={20}/></button>
                <button onClick={() => addNode('conditionNode')} title="Add Condition" className="p-2 bg-yellow-50 text-yellow-600 rounded-lg border border-yellow-100 hover:bg-yellow-100 transition-colors shadow-sm"><Plus size={20}/></button>
                <button onClick={() => addNode('actionNode')} title="Add Action" className="p-2 bg-green-50 text-green-600 rounded-lg border border-green-100 hover:bg-green-100 transition-colors shadow-sm"><Plus size={20}/></button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Properties Sidebar */}
        {selectedNode && (
          <div className="w-80 bg-white border-l shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-gray-700 flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${
                  selectedNode.type === 'triggerNode' ? 'bg-blue-500' :
                  selectedNode.type === 'conditionNode' ? 'bg-yellow-500' :
                  selectedNode.type === 'actionNode' ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                Properties
              </h2>
              <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            
            <div className="p-6 flex flex-col gap-6 overflow-y-auto">
              <div>
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Node ID</label>
                <div className="bg-gray-100 p-2 rounded text-sm text-gray-600 font-mono italic">{selectedNode.id}</div>
              </div>

              {selectedNode.type === 'triggerNode' && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Trigger State</label>
                  <select 
                    value={selectedNode.data.state || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { state: e.target.value })}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none shadow-inner bg-gray-50"
                  >
                    {WORKFLOW_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-2 italic">The lead state that triggers this workflow entry.</p>
                </div>
              )}

              {selectedNode.type === 'conditionNode' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Lead Field</label>
                    <select 
                      value={selectedNode.data.field || ''}
                      onChange={(e) => updateNodeData(selectedNode.id, { field: e.target.value })}
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none shadow-inner bg-gray-50"
                    >
                      {LEAD_FIELDS.map(f => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Compare Value</label>
                    {FIELD_VALUES[selectedNode.data.field] ? (
                      <select
                        value={selectedNode.data.value || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, { value: e.target.value })}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none shadow-inner bg-gray-50"
                      >
                        {FIELD_VALUES[selectedNode.data.field].map((v: string) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={selectedNode.data.value || ''}
                        onChange={(e) => updateNodeData(selectedNode.id, { value: e.target.value })}
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none shadow-inner bg-gray-50"
                        placeholder="e.g. Meta Ads"
                      />
                    )}
                  </div>
                </>
              )}

              {selectedNode.type === 'actionNode' && (
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 block">Template Name</label>
                  <select 
                    value={selectedNode.data.templateName || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, { templateName: e.target.value })}
                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none shadow-inner bg-gray-50"
                  >
                    {templateOptions.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-2 italic">Select from your approved Twilio Content SIDs.</p>
                </div>
              )}

              <div className="mt-auto pt-6 border-t font-mono text-[10px] text-gray-300 uppercase text-center">
                Autosaving to Canvas...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
