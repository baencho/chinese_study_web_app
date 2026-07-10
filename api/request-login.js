const { createClient } = require('@supabase/supabase-js');

function sendJson(response, status, body) {
  response.status(status).json(body);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const invitationCode = process.env.INVITATION_CODE;

  if (!supabaseUrl || !publishableKey || !serviceRoleKey || !invitationCode) {
    sendJson(response, 500, { error: 'Login server is not configured.' });
    return;
  }

  const { email, code, redirectTo } = request.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const submittedCode = String(code || '').trim();
  const redirectUrl = String(redirectTo || '').trim();

  if (!normalizedEmail || !submittedCode || !redirectUrl) {
    sendJson(response, 400, {
      error: 'Email, invitation code, and redirect URL are required.',
    });
    return;
  }

  if (submittedCode !== invitationCode) {
    sendJson(response, 403, { error: 'Invitation code is incorrect.' });
    return;
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo: redirectUrl },
  );

  if (!inviteError) {
    sendJson(response, 200, { message: 'Invitation email sent.' });
    return;
  }

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error: loginError } = await publicClient.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectUrl,
    },
  });

  if (loginError) {
    sendJson(response, 400, { error: loginError.message || inviteError.message });
    return;
  }

  sendJson(response, 200, { message: 'Login email sent.' });
};
