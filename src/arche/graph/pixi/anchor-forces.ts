import Matter from 'matter-js';
import { ANCHOR_FORCES } from './physics-config';

/**
 * Метаданные ноды для применения anchor forces
 */
export interface NodeAnchorMeta {
  bodyId: number;
  nodeId: string;
  type: string;
  index?: number; // индекс среди нод одного типа (для time-axis spacing)
}

export interface GraphLink {
  source: string;
  target: string;
}

/**
 * Применяет anchor forces к нодам
 */
export class AnchorForceSystem {
  private nodeRegistry: Map<number, NodeAnchorMeta> = new Map();
  private nodeIdToBodyId: Map<string, number> = new Map();
  private timeNodes: NodeAnchorMeta[] = [];
  private hubNodes: NodeAnchorMeta[] = [];
  private links: GraphLink[] = [];

  /**
   * Регистрирует ноду для применения anchor forces
   */
  registerNode(meta: NodeAnchorMeta) {
    this.nodeRegistry.set(meta.bodyId, meta);
    this.nodeIdToBodyId.set(meta.nodeId, meta.bodyId);
    
    if (meta.type === 'time') {
      this.timeNodes.push(meta);
      // Сортируем по nodeId для стабильного порядка
      this.timeNodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
      // Обновляем индексы
      this.timeNodes.forEach((node, idx) => {
        node.index = idx;
      });
    }
    
    if (meta.type === 'hub') {
      this.hubNodes.push(meta);
    }
  }

  /**
   * Устанавливает связи для spring forces
   */
  setLinks(links: GraphLink[]) {
    this.links = links;
  }

  /**
   * Удаляет ноду из registry
   */
  unregisterNode(bodyId: number) {
    const meta = this.nodeRegistry.get(bodyId);
    if (!meta) return;
    
    this.nodeRegistry.delete(bodyId);
    this.nodeIdToBodyId.delete(meta.nodeId);
    
    if (meta.type === 'time') {
      this.timeNodes = this.timeNodes.filter(n => n.bodyId !== bodyId);
      // Обновляем индексы
      this.timeNodes.forEach((node, idx) => {
        node.index = idx;
      });
    }
    
    if (meta.type === 'hub') {
      this.hubNodes = this.hubNodes.filter(n => n.bodyId !== bodyId);
    }
  }

  /**
   * Применяет anchor forces ко всем телам
   * Вызывается на каждом тике физики
   */
  applyForces(world: Matter.World) {
    const bodies = Matter.Composite.allBodies(world);
    
    // 1. Repulsion forces (отталкивание между всеми нодами)
    this.applyRepulsionForces(bodies);
    
    // 2. Link spring forces (пружины для связей)
    this.applyLinkSpringForces(bodies);
    
    // 3. Anchor forces (якоря)
    for (const body of bodies) {
      if (body.isStatic) continue;
      
      const meta = this.nodeRegistry.get(body.id);
      if (!meta) continue;
      
      // Time-axis attraction
      if (meta.type === 'time' && meta.index !== undefined) {
        this.applyTimeAxisForce(body, meta.index);
      }
      
      // Hub gravity (слабое притяжение к центру hub нод)
      if (meta.type !== 'hub' && this.hubNodes.length > 0) {
        this.applyHubGravity(body, world);
      }
    }
  }

  /**
   * Применяет силы отталкивания между всеми нодами
   */
  private applyRepulsionForces(bodies: Matter.Body[]) {
    const config = ANCHOR_FORCES.repulsion;
    
    // O(n²) но для 72 нод это нормально
    for (let i = 0; i < bodies.length; i++) {
      const bodyA = bodies[i];
      if (bodyA.isStatic) continue;
      
      for (let j = i + 1; j < bodies.length; j++) {
        const bodyB = bodies[j];
        if (bodyB.isStatic) continue;
        
        const dx = bodyB.position.x - bodyA.position.x;
        const dy = bodyB.position.y - bodyA.position.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);
        
        if (dist < 0.1) continue; // избегаем деления на 0
        
        // Сила отталкивания обратно пропорциональна расстоянию
        const force = config.strength / Math.max(distSq, config.minDistance * config.minDistance);
        
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        
        Matter.Body.applyForce(bodyA, bodyA.position, { x: -fx, y: -fy });
        Matter.Body.applyForce(bodyB, bodyB.position, { x: fx, y: fy });
      }
    }
  }

  /**
   * Применяет пружины для связей
   */
  private applyLinkSpringForces(bodies: Matter.Body[]) {
    const config = ANCHOR_FORCES.linkSpring;
    
    // Создаём map для быстрого поиска тел
    const bodyMap = new Map<number, Matter.Body>();
    for (const body of bodies) {
      bodyMap.set(body.id, body);
    }
    
    // Применяем пружины для каждой связи
    for (const link of this.links) {
      const sourceBodyId = this.nodeIdToBodyId.get(link.source);
      const targetBodyId = this.nodeIdToBodyId.get(link.target);
      
      if (!sourceBodyId || !targetBodyId) continue;
      
      const bodyA = bodyMap.get(sourceBodyId);
      const bodyB = bodyMap.get(targetBodyId);
      
      if (!bodyA || !bodyB) continue;
      if (bodyA.isStatic && bodyB.isStatic) continue;
      
      const dx = bodyB.position.x - bodyA.position.x;
      const dy = bodyB.position.y - bodyA.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 0.1) continue;
      
      // Пружина Гука: F = k * (dist - restLength)
      const displacement = dist - config.restLength;
      const force = displacement * config.stiffness;
      
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      
      if (!bodyA.isStatic) {
        Matter.Body.applyForce(bodyA, bodyA.position, { x: fx, y: fy });
      }
      if (!bodyB.isStatic) {
        Matter.Body.applyForce(bodyB, bodyB.position, { x: -fx, y: -fy });
      }
    }
  }

  /**
   * Применяет притяжение к оси для time нод
   */
  private applyTimeAxisForce(body: Matter.Body, index: number) {
    const config = ANCHOR_FORCES.timeAxis;
    
    // Целевая позиция на оси
    const targetX = (index - (this.timeNodes.length - 1) / 2) * config.spacing;
    const targetY = config.targetY;
    
    // Сила притяжения
    const dx = targetX - body.position.x;
    const dy = targetY - body.position.y;
    
    const forceX = dx * config.k;
    const forceY = dy * config.k;
    
    Matter.Body.applyForce(body, body.position, { x: forceX, y: forceY });
  }

  /**
   * Применяет притяжение к hub нодам
   */
  private applyHubGravity(body: Matter.Body, world: Matter.World) {
    const config = ANCHOR_FORCES.hubGravity;
    
    // Центр масс hub нод
    if (this.hubNodes.length === 0) return;
    
    let centerX = 0;
    let centerY = 0;
    let foundHubs = 0;
    
    // Получаем все тела из world
    const allBodies = Matter.Composite.allBodies(world);
    
    for (const hubMeta of this.hubNodes) {
      const hubBody = allBodies.find(b => b.id === hubMeta.bodyId);
      if (hubBody) {
        centerX += hubBody.position.x;
        centerY += hubBody.position.y;
        foundHubs++;
      }
    }
    
    if (foundHubs === 0) return;
    
    centerX /= foundHubs;
    centerY /= foundHubs;
    
    // Притяжение к центру
    const dx = centerX - body.position.x;
    const dy = centerY - body.position.y;
    
    const forceX = dx * config.k;
    const forceY = dy * config.k;
    
    Matter.Body.applyForce(body, body.position, { x: forceX, y: forceY });
  }

  /**
   * Очищает всю registry
   */
  clear() {
    this.nodeRegistry.clear();
    this.nodeIdToBodyId.clear();
    this.timeNodes = [];
    this.hubNodes = [];
    this.links = [];
  }
}

