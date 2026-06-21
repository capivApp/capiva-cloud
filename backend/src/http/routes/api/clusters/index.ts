import type { Router } from "express";
import { container } from "@di/index";
import { ClusterController } from "@controller/ClusterController";
import { ClusterProvisioningController } from "@controller/ClusterProvisioningController";
import { authMiddleware } from "@middleware/auth";

export const middlewares = [authMiddleware];

export const registry = (router: Router): void => {
  const ctrl = container.get(ClusterController);
  const prov = container.get(ClusterProvisioningController);
  router.get("/", ctrl.list);
  router.post("/", ctrl.create);
  router.patch("/:id", ctrl.update);
  router.delete("/:id", ctrl.remove);

  // Provisionamento (subir Kubernetes) e gestão de nós.
  router.post("/provision/copy-paste", prov.copyPaste);
  router.post("/provision/ssh", prov.ssh);
  router.get("/:id/join", prov.joinCommand);
  router.get("/:id/nodes", prov.listNodes);
  router.post("/:id/nodes/:node/cordon", prov.cordon);
  router.delete("/:id/nodes/:nodeId", prov.removeNode);
};
