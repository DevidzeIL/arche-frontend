export interface PixiNode {
  id: string;
  title: string;
  type?: string;
  folder: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  links: number;
}

export interface PixiEdge {
  sourceId: string;
  targetId: string;
}

export interface NodeBody {
  id: string;
  body: any; // Matter.Body
  node: PixiNode;
}

export interface EdgeConstraint {
  id: string;
  constraint: any; // Matter.Constraint
  edge: PixiEdge;
}


