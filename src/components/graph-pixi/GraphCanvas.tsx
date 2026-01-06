import { useMemo, useState, useRef, useEffect } from 'react';
import { Application } from '@pixi/react';
import { WorldProvider } from './World';
import { PhysicsLoop } from './PhysicsLoop';
import { Mouse } from './Mouse';
import { CameraProvider, useCamera } from './Camera';
import { GraphScene } from './GraphScene';
import { GraphNode, GraphLink } from './buildGraphData';

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  onHover: (nodeId: string | null) => void;
  onSelect: (nodeId: string) => void;
  graphSettings: {
    nodeColors: Record<string, string>;
    nodeSizeBy: 'fixed' | 'links';
    nodeSize: number;
    linkDistance: number;
    linkForce: number;
    repelForce: number;
    linkThickness: number;
    textFadeThreshold: number;
    showArrows: boolean;
  };
  onUnpinAll: () => void;
  onReheat: () => void;
}

function GraphContent({
  nodes,
  links,
  hoveredNodeId,
  selectedNodeId,
  graphSettings,
}: Omit<GraphCanvasProps, 'onHover' | 'onSelect' | 'onUnpinAll' | 'onReheat'>) {
  const { zoom } = useCamera();

  // Calculate highlight nodes and links
  const { highlightNodes, highlightLinks } = useMemo(() => {
    if (!hoveredNodeId) {
      return { highlightNodes: new Set<string>(), highlightLinks: new Set<string>() };
    }

    const highlightNodesSet = new Set<string>([hoveredNodeId]);
    const highlightLinksSet = new Set<string>();

    links.forEach((link) => {
      if (link.source === hoveredNodeId) {
        highlightNodesSet.add(link.target);
        highlightLinksSet.add(`${link.source}-${link.target}`);
      } else if (link.target === hoveredNodeId) {
        highlightNodesSet.add(link.source);
        highlightLinksSet.add(`${link.source}-${link.target}`);
      }
    });

    return { highlightNodes: highlightNodesSet, highlightLinks: highlightLinksSet };
  }, [hoveredNodeId, links]);

  return (
    <>
      <PhysicsLoop />
      <Mouse />
      <GraphScene
        nodes={nodes}
        links={links}
        hoveredNodeId={hoveredNodeId}
        selectedNodeId={selectedNodeId}
        highlightNodes={highlightNodes}
        highlightLinks={highlightLinks}
        graphSettings={graphSettings}
        zoom={zoom}
      />
    </>
  );
}

export function GraphCanvas({
  nodes,
  links,
  hoveredNodeId,
  selectedNodeId,
  graphSettings,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Update dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <Application
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor={0x000000}
        antialias={true}
      >
        <WorldProvider>
          <CameraProvider>
            <GraphContent
              nodes={nodes}
              links={links}
              hoveredNodeId={hoveredNodeId}
              selectedNodeId={selectedNodeId}
              graphSettings={graphSettings}
            />
          </CameraProvider>
        </WorldProvider>
      </Application>
    </div>
  );
}
