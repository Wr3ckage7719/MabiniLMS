/**
 * Returns the "class home" path appropriate for the user's role.
 * Full-screen lesson/material pages live outside AppLayout, so navigating
 * to /class/:id would cause AppLayout to redirect teachers to /teacher.
 * Teachers should land on their own class detail page instead.
 */
export const getClassHomePath = (role: string | undefined, classId: string): string => {
  const r = (role || '').toLowerCase();
  if (r === 'teacher') return `/teacher/classes/${classId}`;
  if (r === 'admin') return `/admin/dashboard`;
  return `/class/${classId}`;
};
