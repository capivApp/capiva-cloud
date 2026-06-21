import { EventEmitter } from "events";

/**
 * Barramento de eventos em memória para streaming em tempo real (SSE).
 * Para múltiplas instâncias do control plane, trocar por Redis pub/sub
 * mantendo esta mesma interface.
 */
export interface DeploymentEventPayload {
  label: string;
  status: string;
  progress: number;
  done?: boolean;
}

class DeploymentEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(deploymentId: string, payload: DeploymentEventPayload): void {
    this.emitter.emit(deploymentId, payload);
  }

  subscribe(deploymentId: string, listener: (payload: DeploymentEventPayload) => void): () => void {
    this.emitter.on(deploymentId, listener);
    return () => this.emitter.off(deploymentId, listener);
  }
}

export const deploymentEvents = new DeploymentEventBus();
