import type { Env } from '../env.d';
import type { Logger } from '../logging';

export interface AppVariables {
  requestId: string;
  logger: Logger;
}

export type AppBindings = {
  Bindings: Env;
  Variables: AppVariables;
};
