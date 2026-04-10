import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types/index.js';
import * as invitationService from '../services/invitations.js';

export const createInvitation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invitation = await invitationService.createInvitation(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.status(201).json({
      success: true,
      data: invitation,
    });
  } catch (error) {
    next(error);
  }
};

export const directEnrollByEmail = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await invitationService.directEnrollByEmail(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const bulkDirectEnrollByEmail = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await invitationService.bulkDirectEnrollByEmail(
      req.body,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const listMyInvitations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await invitationService.listMyInvitations(
      req.user!.id,
      req.user!.email,
      req.query as any
    );

    res.json({
      success: true,
      data: result.invitations,
      meta: {
        total: result.total,
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const listCourseInvitations = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await invitationService.listCourseInvitations(
      req.params.courseId,
      req.user!.id,
      req.user!.role as UserRole,
      req.query as any
    );

    res.json({
      success: true,
      data: result.invitations,
      meta: {
        total: result.total,
        limit: Number(req.query.limit) || 50,
        offset: Number(req.query.offset) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const acceptInvitation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const result = await invitationService.acceptInvitation(
      req.params.id,
      req.user!.id,
      req.user!.email
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const declineInvitation = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const invitation = await invitationService.declineInvitation(
      req.params.id,
      req.user!.id,
      req.user!.email
    );

    res.json({
      success: true,
      data: invitation,
    });
  } catch (error) {
    next(error);
  }
};
