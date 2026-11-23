import { Router, type IRouter } from "express";
import assistedRecoveryRouter from './assisted-recovery';
import passwordRecoveryRouter from "./password-recovery";
import adminRouter from "./admin";
import healthRouter from "./health";
import authRouter from "./auth";
import workspaceRouter from "./workspace";
import storageRouter from "./storage";
import aiRouter from "./ai";
import chatHistoryRouter from "./chat-history";
import memoryRouter from "./memory";
import analyticsRouter from "./analytics";
import collaborationRouter from "./collaboration";
import toolActionsRouter from "./tool-actions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(assistedRecoveryRouter);
router.use(adminRouter);
router.use(authRouter);
router.use(passwordRecoveryRouter);
router.use(workspaceRouter);
router.use(storageRouter);
router.use(aiRouter);
router.use(chatHistoryRouter);
router.use(memoryRouter);
router.use(analyticsRouter);
router.use(collaborationRouter);
router.use(toolActionsRouter);

export default router;
