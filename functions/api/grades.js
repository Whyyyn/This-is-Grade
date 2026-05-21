const sampleGrades = [
  { "subject": "English", "score": 86.4, "raw": "English 86.4", "source": "sample", "assignments": [] },
  { "subject": "Mathematics", "score": 91.6, "raw": "Mathematics 91.6", "source": "sample", "assignments": [] },
  { "subject": "Chemistry", "score": 78.8, "raw": "Chemistry 78.8", "source": "sample", "assignments": [] },
  { "subject": "Physics", "score": 84.2, "raw": "Physics 84.2", "source": "sample", "assignments": [] },
  { "subject": "Biology", "score": 88.9, "raw": "Biology 88.9", "source": "sample", "assignments": [] }
];

export async function onRequestGet() {
  return new Response(JSON.stringify(sampleGrades), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
