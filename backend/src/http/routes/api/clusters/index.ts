import type { Router } from "express";
import { container } from "@di/index";
import { ClusterController } from "@controller/ClusterController";
import { ClusterProvisioningController } from "@controller/ClusterProvisioningController";
import { authMiddleware } from "@middleware/auth";
import { requireRole } from "@middleware/rbac";

export const middlewares = [authMiddleware];

// Gestão de cluster (infra) exige ADMIN+.
const admin = requireRole("ADMIN");

export const registry = (router: Router): void => {
  const ctrl = container.get(ClusterController);
  const prov = container.get(ClusterProvisioningController);
  router.get("/", ctrl.list);
  router.post("/", admin, ctrl.create);
  router.patch("/:id", admin, ctrl.update);
  router.delete("/:id", admin, ctrl.remove);

  // Provisionamento (subir Kubernetes) e gestão de nós.
  router.post("/provision/copy-paste", admin, prov.copyPaste);
  router.post("/provision/ssh", admin, prov.ssh);
  router.get("/:id/join", prov.joinCommand);
  router.get("/:id/nodes", prov.listNodes);
  router.post("/:id/nodes/:node/cordon", admin, prov.cordon);
  router.delete("/:id/nodes/:nodeId", admin, prov.removeNode);
};
