import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { useWorld } from './World';
import { Node } from './Node';
import { Line } from './Line';
import { GraphNode, GraphLink } from './buildGraphData';

interface GraphSceneProps {
  nodes: GraphNode[];
  links: GraphLink[];
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  highlightNodes: Set<string>;
  highlightLinks: Set<string>;
  graphSettings: {
    nodeColors: Record<string, string>;
    nodeSizeBy: 'fixed' | 'links';
    nodeSize: number;
    linkDistance: number;
    linkForce: number;
    repelForce: number;
    linkThickness: number;
    textFadeThreshold: number;
  };
  zoom: number;
}

export function GraphScene({
  nodes,
  links,
  hoveredNodeId,
  selectedNodeId,
  highlightNodes,
  highlightLinks,
  graphSettings,
  zoom,
}: GraphSceneProps) {
  const { world } = useWorld();
  const bodiesRef = useRef<Map<string, Matter.Body>>(new Map());
  const constraintsRef = useRef<Map<string, Matter.Constraint>>(new Map());

  // Create Matter bodies for nodes
  useEffect(() => {
    nodes.forEach((node) => {
      if (bodiesRef.current.has(node.id)) return;

      const radius = graphSettings.nodeSizeBy === 'links'
        ? Math.max(3, Math.min(10, graphSettings.nodeSize + node.links * 0.3))
        : graphSettings.nodeSize;

      const x = (Math.random() - 0.5) * 3000;
      const y = (Math.random() - 0.5) * 3000;

      const body = Matter.Bodies.circle(x, y, radius, {
        frictionAir: 0.12,
        restitution: 0.3,
        density: 0.001,
        inertia: Infinity,
      });

      (body as any).nodeId = node.id;
      Matter.World.add(world, body);
      bodiesRef.current.set(node.id, body);
    });

    // Remove bodies for nodes that no longer exist
    const currentIds = new Set(nodes.map((n) => n.id));
    bodiesRef.current.forEach((body, id) => {
      if (!currentIds.has(id)) {
        Matter.World.remove(world, body);
        bodiesRef.current.delete(id);
      }
    });
  }, [nodes, world, graphSettings]);

  // Create constraints for links
  useEffect(() => {
    links.forEach((link) => {
      const key = `${link.source}-${link.target}`;
      if (constraintsRef.current.has(key)) return;

      const sourceBody = bodiesRef.current.get(link.source);
      const targetBody = bodiesRef.current.get(link.target);

      if (!sourceBody || !targetBody) return;

      const stiffness = 0.001 + (graphSettings.linkForce / 2) * 0.019;
      const constraint = Matter.Constraint.create({
        bodyA: sourceBody,
        bodyB: targetBody,
        length: graphSettings.linkDistance,
        stiffness,
        damping: 0.1,
      });

      Matter.World.add(world, constraint);
      constraintsRef.current.set(key, constraint);
    });

    // Remove constraints for links that no longer exist
    const currentKeys = new Set(links.map((l) => `${l.source}-${l.target}`));
    constraintsRef.current.forEach((constraint, key) => {
      if (!currentKeys.has(key)) {
        Matter.World.remove(world, constraint);
        constraintsRef.current.delete(key);
      }
    });
  }, [links, world, graphSettings.linkDistance, graphSettings.linkForce]);

  // Apply repulsion force
  useEffect(() => {
    const bodies = Array.from(bodiesRef.current.values());

    const applyRepulsion = () => {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const bodyA = bodies[i];
          const bodyB = bodies[j];

          const dx = bodyB.position.x - bodyA.position.x;
          const dy = bodyB.position.y - bodyA.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 0.01) continue;

          const force = graphSettings.repelForce / (distance * distance);
          const angle = Math.atan2(dy, dx);

          Matter.Body.applyForce(bodyA, bodyA.position, {
            x: -Math.cos(angle) * force,
            y: -Math.sin(angle) * force,
          });

          Matter.Body.applyForce(bodyB, bodyB.position, {
            x: Math.cos(angle) * force,
            y: Math.sin(angle) * force,
          });
        }
      }
    };

    // Apply repulsion periodically (not every frame to avoid performance issues)
    const interval = setInterval(applyRepulsion, 100);

    return () => clearInterval(interval);
  }, [graphSettings.repelForce, bodiesRef.current]);

  return (
    <>
      {/* Render edges first */}
      {links.map((link) => {
        const sourceBody = bodiesRef.current.get(link.source);
        const targetBody = bodiesRef.current.get(link.target);
        if (!sourceBody || !targetBody) return null;

        const key = `${link.source}-${link.target}`;
        const isHighlighted = highlightLinks.has(key);

        return (
          <Line
            key={key}
            sourceId={link.source}
            targetId={link.target}
            sourceBody={sourceBody}
            targetBody={targetBody}
            isHighlighted={isHighlighted}
            zoom={zoom}
            baseThickness={graphSettings.linkThickness}
            hoveredNodeId={hoveredNodeId}
          />
        );
      })}

      {/* Render nodes second */}
      {nodes.map((node) => {
        return (
          <Node
            key={node.id}
            node={node}
            graphSettings={graphSettings}
            hoveredNodeId={hoveredNodeId}
            selectedNodeId={selectedNodeId}
            highlightNodes={highlightNodes}
          />
        );
      })}
    </>
  );
}

