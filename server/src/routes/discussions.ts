import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { UserRole } from '../types/index.js';
import {
  courseDiscussionPostsParamSchema,
  createDiscussionPostSchema,
  discussionPostLikeParamSchema,
  listDiscussionPostsQuerySchema,
} from '../types/discussions.js';
import * as discussionController from '../controllers/discussions.js';

const router = Router();

router.use(
  authenticate,
  authorize(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
);

// GET /api/courses/:courseId/discussions/posts - list discussion posts for a course
router.get(
  '/courses/:courseId/discussions/posts',
  validate({
    params: courseDiscussionPostsParamSchema,
    query: listDiscussionPostsQuerySchema,
  }),
  discussionController.listDiscussionPosts
);

// POST /api/courses/:courseId/discussions/posts - create discussion post
router.post(
  '/courses/:courseId/discussions/posts',
  validate({
    params: courseDiscussionPostsParamSchema,
    body: createDiscussionPostSchema,
  }),
  discussionController.createDiscussionPost
);

// POST /api/courses/:courseId/discussions/posts/:postId/like - toggle like for post
router.post(
  '/courses/:courseId/discussions/posts/:postId/like',
  validate({ params: discussionPostLikeParamSchema }),
  discussionController.toggleDiscussionPostLike
);

export default router;
