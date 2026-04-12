import { NextFunction, Response } from 'express';
import { AuthRequest, UserRole } from '../types/index.js';
import {
  CreateDiscussionPostInput,
  ListDiscussionPostsQuery,
} from '../types/discussions.js';
import * as discussionService from '../services/discussions.js';

export const listDiscussionPosts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const query = req.query as any as ListDiscussionPostsQuery;

    const result = await discussionService.listDiscussionPosts(
      courseId,
      query,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: result.posts,
      meta: {
        total: result.total,
        limit: query.limit,
        offset: query.offset,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createDiscussionPost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    const input = req.body as CreateDiscussionPostInput;

    const post = await discussionService.createDiscussionPost(
      courseId,
      input,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.status(201).json({
      success: true,
      data: post,
    });
  } catch (error) {
    next(error);
  }
};

export const toggleDiscussionPostLike = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId, postId } = req.params;

    const result = await discussionService.toggleDiscussionPostLike(
      courseId,
      postId,
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

export const hideDiscussionPost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId, postId } = req.params;

    const post = await discussionService.hideDiscussionPost(
      courseId,
      postId,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: post,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDiscussionPost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId, postId } = req.params;

    await discussionService.deleteDiscussionPost(
      courseId,
      postId,
      req.user!.id,
      req.user!.role as UserRole
    );

    res.json({
      success: true,
      data: {
        message: 'Discussion post removed',
      },
    });
  } catch (error) {
    next(error);
  }
};
