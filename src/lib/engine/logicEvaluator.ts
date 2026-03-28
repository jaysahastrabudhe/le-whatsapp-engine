import { Lead } from '../supabase';
import type { RoutingReason } from './eventLogger';

interface ReactFlowNode {
  id: string;
  type: string;
  data: any;
}

interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface EvaluatedAction {
  type: 'send_template' | 'close' | 'no_match';
  templateName?: string;
  reason: RoutingReason;
}

/**
 * Traverses a React Flow JSON graph (nodes and edges) matching
 * a given lead against the conditional paths to return the terminal Action node.
 */
export function evaluateWorkflowGraph(
  triggerState: string,
  lead: Lead,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[]
): EvaluatedAction {
  const triggerNode = nodes.find(
    (n) => n.type === 'triggerNode' && (
      n.data?.state === triggerState ||
      n.data?.label?.includes(`State: ${triggerState}`)
    )
  );

  if (!triggerNode) {
    return { type: 'no_match', reason: 'graph_unrouted' };
  }

  return stepGraph(triggerNode.id, lead, nodes, edges);
}

function stepGraph(
  currentNodeId: string,
  lead: Lead,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[]
): EvaluatedAction {
  const currentNode = nodes.find((n) => n.id === currentNodeId);
  if (!currentNode) return { type: 'no_match', reason: 'graph_unrouted' };

  if (currentNode.type === 'actionNode') {
    const templateName = currentNode.data?.templateName || '';
    if (templateName) {
      return { type: 'send_template', templateName, reason: 'graph_match' };
    }
    const label = currentNode.data?.label || '';
    if (label.includes('Send Template:')) {
      const parts = label.split(':');
      const extractedTemplate = parts[1]?.trim() || '';
      return { type: 'send_template', templateName: extractedTemplate, reason: 'graph_match' };
    }
    return { type: 'no_match', reason: 'graph_unrouted' };
  }

  if (currentNode.type === 'endNode') {
    // Derive reason from the end node label
    const label = (currentNode.data?.label || '').toLowerCase();
    if (label.includes('storysells')) return { type: 'close', reason: 'graph_filtered_storysells' };
    if (label.includes('relocat'))   return { type: 'close', reason: 'graph_filtered_no_relocate' };
    if (label.includes('urgency') || label.includes('low')) return { type: 'close', reason: 'graph_filtered_low_urgency' };
    return { type: 'close', reason: 'graph_filtered_storysells' }; // safe fallback label
  }

  if (currentNode.type === 'triggerNode' || currentNode.type === 'conditionNode') {
    const outgoingEdges = edges.filter((e) => e.source === currentNode.id);
    if (outgoingEdges.length === 0) return { type: 'no_match', reason: 'graph_unrouted' };

    if (currentNode.type === 'triggerNode') {
      return stepGraph(outgoingEdges[0].target, lead, nodes, edges);
    }

    if (currentNode.type === 'conditionNode') {
      let isTrue = false;
      const { field, value, label } = currentNode.data || {};

      if (field && value) {
        const leadValue = (lead as any)[field];
        isTrue = String(leadValue ?? '').toLowerCase().includes(String(value).toLowerCase());
      } else {
        const conditionStr = label || '';
        if (conditionStr.toLowerCase().includes('source == meta ads')) {
          isTrue = lead.lead_source?.toLowerCase().includes('meta') ?? false;
        }
      }

      const targetEdge = outgoingEdges.find((e) => e.sourceHandle === (isTrue ? 'true' : 'false'));
      if (targetEdge) {
        return stepGraph(targetEdge.target, lead, nodes, edges);
      }
    }
  }

  return { type: 'no_match', reason: 'graph_unrouted' };
}
