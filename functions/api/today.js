import { getBeijingDateString } from '../_lib/scheduler.js';
import { getTodaySession, HttpError } from '../_lib/vocab-repo.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestGet(context) {
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

    const url = new URL(context.request.url);
    const dateParam = url.searchParams.get('date')?.trim();
    const targetDate = dateParam || getBeijingDateString();

    const session = await getTodaySession(db, targetDate);
    return new Response(
      JSON.stringify({
        ok: true,
        ...session
      }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const code = err instanceof HttpError ? err.code : 'INTERNAL_ERROR';
    return new Response(
      JSON.stringify({
        ok: false,
        code,
        error: err?.message || 'Unexpected error while loading today cards'
      }),
      { status, headers: JSON_HEADERS }
    );
  }
}
