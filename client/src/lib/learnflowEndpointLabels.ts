export const LEARNFLOW_ENDPOINT_LABELS = {
  auth: {
    signupTeacher: 'POST /api/auth/signup',
    signupStudentCredentials: 'POST /api/auth/student-signup',
    login: 'POST /api/auth/login',
    forgotPassword: 'POST /api/auth/send-password-reset',
    resetPasswordToken: 'POST /api/auth/reset-password-token',
    googleOAuthStart: 'Supabase OAuth (provider: google)',
  },

  courses: {
    list: 'GET /api/courses',
    detail: 'GET /api/courses/:id',
    create: 'POST /api/courses',
    update: 'PATCH /api/courses/:id',
    archive: 'PATCH /api/courses/:id/archive',
    unarchive: 'PATCH /api/courses/:id/unarchive',
    students: 'GET /api/courses/:courseId/students',
    teachers: 'GET /api/courses/:courseId/teachers',
    materials: 'GET /api/courses/:courseId/materials',
    announcements: 'GET /api/courses/:courseId/announcements',
  },

  assignments: {
    list: 'GET /api/assignments?course_id=:courseId',
    create: 'POST /api/assignments/courses/:courseId/assignments',
    detail: 'GET /api/assignments/:id',
    update: 'PATCH /api/assignments/:id',
    delete: 'DELETE /api/assignments/:id',
    submit: 'POST /api/assignments/:assignmentId/submit',
    mySubmission: 'GET /api/assignments/:assignmentId/my-submission',
    submissions: 'GET /api/assignments/:assignmentId/submissions',
  },

  grades: {
    myGrades: 'GET /api/grades/my-grades',
    assignmentGrades: 'GET /api/grades/assignment/:assignmentId',
    createOrUpdate: 'POST /api/grades',
  },

  announcements: {
    list: 'GET /api/courses/:courseId/announcements',
    create: 'POST /api/courses/:courseId/announcements',
    update: 'PATCH /api/announcements/:id',
    delete: 'DELETE /api/announcements/:id',
  },

  pendingBackendWork: {
    invitationsCreate: 'POST /api/classes/:classId/invitations (not implemented in server routes)',
    invitationsAccept: 'PATCH /api/invitations/:invitationId/accept (not implemented in server routes)',
    invitationsDecline: 'PATCH /api/invitations/:invitationId/decline (not implemented in server routes)',
    streamPostsList: 'GET /api/classes/:classId/stream/posts (not implemented in server routes)',
    streamPostsCreate: 'POST /api/classes/:classId/stream/posts (not implemented in server routes)',
    postLike: 'POST /api/posts/:postId/like (not implemented in server routes)',
    assignmentCommentsList: 'GET /api/assignments/:assignmentId/comments (not implemented in server routes)',
    assignmentCommentsCreate: 'POST /api/assignments/:assignmentId/comments (not implemented in server routes)',
    submissionFeedback: 'POST /api/assignments/:assignmentId/submissions/:submissionId/feedback (not implemented in server routes)',
  },
} as const;

export type LearnflowEndpointLabels = typeof LEARNFLOW_ENDPOINT_LABELS;
