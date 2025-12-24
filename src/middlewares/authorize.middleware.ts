import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.middleware";

export const authorize =
  (...roles: string[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Acceso denegado: rol no autorizado" });
    }

    next();
  };
