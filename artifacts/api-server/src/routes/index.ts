import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import workspaceRouter from "./workspace";
import storageRouter from "./storage";
import aiRouter from "./ai";
import chatHistoryRouter from "./chat-history";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(workspaceRouter);
router.use(storageRouter);
router.use(aiRouter);
router.use(chatHistoryRouter);

export default router;
