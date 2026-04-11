# Weighted Grade API Contract

**Feature:** LMS-004 weighted grading (40/30/30)
**Endpoint:** `GET /api/grades/course/:courseId/weighted`

## Authentication
- Requires `Authorization: Bearer <jwt>`
- Allowed roles: `student`, `teacher`, `admin`

## Request
### Path Params
- `courseId` (uuid, required): target course

### Query Params
- `student_id` (uuid, optional)

### Role Rules
- Student:
  - May omit `student_id` (server uses own user id)
  - If provided, must equal own user id
- Teacher:
  - Must provide `student_id`
  - Must be teacher of the target course
- Admin:
  - Must provide `student_id`

## Response (200)
```json
{
  "success": true,
  "data": {
    "course_id": "8c42e4d9-5f87-4f0f-99f5-0f67c9d6b0f1",
    "student_id": "2d9b1b62-f8f6-4f44-bf2f-e422690e58e5",
    "policy": "missing_categories_count_as_zero",
    "final_percentage": 87.5,
    "letter_grade": "B",
    "weights": {
      "exam": 0.4,
      "quiz": 0.3,
      "activity": 0.3
    },
    "categories": {
      "exam": {
        "category": "exam",
        "weight": 0.4,
        "assignment_total": 2,
        "graded_count": 2,
        "points_earned": 177,
        "points_possible": 200,
        "raw_percentage": 88.5,
        "weighted_contribution": 35.4
      },
      "quiz": {
        "category": "quiz",
        "weight": 0.3,
        "assignment_total": 4,
        "graded_count": 3,
        "points_earned": 245,
        "points_possible": 300,
        "raw_percentage": 81.67,
        "weighted_contribution": 24.5
      },
      "activity": {
        "category": "activity",
        "weight": 0.3,
        "assignment_total": 6,
        "graded_count": 5,
        "points_earned": 460,
        "points_possible": 500,
        "raw_percentage": 92,
        "weighted_contribution": 27.6
      }
    }
  }
}
```

## Error Responses
- `400 VALIDATION_ERROR`
  - Invalid `courseId`/`student_id`
  - Missing `student_id` for teacher/admin requests
- `403 FORBIDDEN`
  - Student requested another student id
  - Teacher is not owner of the course
- `404 NOT_FOUND`
  - Course or student not found
- `500 INTERNAL_ERROR`
  - Unexpected backend failure

## Deterministic Formula
- `final = (exam_avg * 0.4) + (quiz_avg * 0.3) + (activity_avg * 0.3)`
- Missing categories contribute `0` under current policy.
