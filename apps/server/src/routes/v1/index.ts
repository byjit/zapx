import { Router } from "express";
import {
  type AuthenticatedRequest,
  authMiddleware,
} from "../../middleware/auth";

const router = Router();

// Apply auth middleware to all routes in this router
router.use(authMiddleware);

router.get("/me", (req, res) => {
  const session = (req as AuthenticatedRequest).session;
  res.json({
    user: session?.user,
    session: session?.session,
  });
});

export const v1Router: Router = router;
