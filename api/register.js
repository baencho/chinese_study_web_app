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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const invitationCode = process.env.INVITATION_CODE;

  if (!supabaseUrl || !serviceRoleKey || !invitationCode) {
    sendJson(response, 500, { error: 'Signup server is not configured.' });
    return;
  }

  const { email, password, code } = request.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const submittedPassword = String(password || '');
  const submittedCode = String(code || '').trim();

  if (!normalizedEmail || !submittedPassword || !submittedCode) {
    sendJson(response, 400, {
      error: 'Email, password, and invitation code are required.',
    });
    return;
  }

  if (submittedPassword.length < 6) {
    sendJson(response, 400, { error: 'Password must be at least 6 characters.' });
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

  const { error } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: submittedPassword,
    email_confirm: true,
  });

  if (error) {
    const isDuplicate = error.message?.toLowerCase().includes('already');
    sendJson(response, isDuplicate ? 409 : 400, {
      error: isDuplicate ? '이미 가입된 이메일입니다.' : error.message,
    });
    return;
  }

  sendJson(response, 201, { message: 'User created.' });
};
