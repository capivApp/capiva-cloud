import { Injectable, container } from "@di/index";
import { ApplicationReconciler } from "@infra/kubernetes/reconcilers/ApplicationReconciler";
import { DatabaseReconciler } from "@infra/kubernetes/reconcilers/DatabaseReconciler";
import { CronJobReconciler, WorkerReconciler } from "@infra/kubernetes/reconcilers/WorkloadReconcilers";

/**
 * Factory que escolhe a Strategy de reconciliação por tipo de recurso.
 * Services dependem desta factory (não das implementações concretas).
 */
@Injectable()
export class ReconcilerFactory {
  forApplication(): ApplicationReconciler {
    return container.get(ApplicationReconciler);
  }

  forDatabase(): DatabaseReconciler {
    return container.get(DatabaseReconciler);
  }

  forWorker(): WorkerReconciler {
    return container.get(WorkerReconciler);
  }

  forCronJob(): CronJobReconciler {
    return container.get(CronJobReconciler);
  }
}
