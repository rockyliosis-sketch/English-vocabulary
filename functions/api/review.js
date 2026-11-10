import { submitReviewResult, HttpError } from '../_lib/vocab-repo.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestPost(context) {
  try {
    const db = context.env?.VOCAB_DB;
    if (!db) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'MISSING_D1_BINDING',
          error: 'Cloudflare D1 binding VOCAB_DB is not configured'
        }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          code: 'INVALID_JSON',
          error: 'Request body must be valid JSON'
        }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const payload = await submitReviewResult(db, {
      wordId: body?.word_id,
      result: body?.result,
      reviewDate: body?.date || null,
      now: context.env?.__TEST_NOW || Date.now()
    });

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const code = err instanceof HttpError ? err.code : 'INTERNAL_ERROR';
    return new Response(
      JSON.stringify({
        ok: false,
        code,
        error: err?.message || 'Unexpected error while saving review result'
      }),
      { status, headers: JSON_HEADERS }
    );
  }
}
