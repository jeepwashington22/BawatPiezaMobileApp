import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Read the JSON body from the database trigger
    const body = await req.json()
    const { email, full_name, first_name } = body

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Build the welcome email content
    const firstName = first_name || full_name?.split(' ')[0] || 'there'
    const appName = 'BawatPieza'
    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://bawatpieza.com'

    const subject = `Welcome to ${appName}! 🎉`

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4">
        <table role="presentation" style="width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:60px 20px;text-align:center;background:#0A2A4A">
              <h1 style="color:#F6C445;font-size:30px;margin:0 0 12px 0">Welcome to ${appName}! 🎉</h1>
              <p style="color:#ffffff;font-size:16px;line-height:1.6;max-width:460px;margin:0 auto">
                Hi ${firstName},
              </p>
              <p style="color:#ffffff;font-size:16px;line-height:1.6;max-width:460px;margin:16px auto">
                Thank you for joining <b>${appName}</b>! We're excited to have you on board.
              </p>
              <p style="color:#ffffff;font-size:15px;line-height:1.6;max-width:460px;margin:0 auto">
                Get started by signing in to your account and exploring all the features we have to offer.
              </p>
              <a href="${frontendUrl}/" style="display:inline-block;background-color:#F6C445;color:#0A2A4A;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;margin:24px auto">
                Sign In to Your Account
              </a>
              <p style="color:#ffffff;font-size:14px;margin:0 auto;max-width:460px">
                If you have any questions, feel free to reach out to our support team.
              </p>
              <p style="color:#ffffff;font-size:14px;margin:12px auto 0;max-width:460px">
                Happy exploring! 
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;text-align:center;background-color:#ffffff">
              <p style="color:#666666;font-size:12px;margin:0">
                You received this email because a new account was created for you on ${appName}.
              </p>
              <p style="color:#999999;font-size:11px;margin:10px 0 0 0">
                © ${new Date().getFullYear()} ${appName}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `

    const text = `Hi ${firstName},

Welcome to ${appName}! 🎉

Thank you for joining ${appName}! We're excited to have you on board.

Get started by signing in to your account and exploring all the features we have to offer.

Sign In: ${frontendUrl}/

If you have any questions, feel free to reach out to our support team.

Happy exploring! 🚀

---
You received this email because a new account was created for ${appName}.`

    // Send the email through the existing BawatPieza backend (Brevo via nodemailer).
    // The backend exposes POST /email/send which accepts { to, subject, text, html }.
    const backendUrl = Deno.env.get('BACKEND_URL')
    const internalKey = Deno.env.get('INTERNAL_API_KEY')

    if (backendUrl && internalKey) {
      const emailResponse = await fetch(`${backendUrl}/email/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${internalKey}`,
        },
        body: JSON.stringify({
          to: email,
          subject,
          text,
          html,
        }),
      })

      if (!emailResponse.ok) {
        const errText = await emailResponse.text()
        console.error('[Welcome Email] Backend send failed:', emailResponse.status, errText)
        return new Response(
          JSON.stringify({ error: `Backend email send failed: ${emailResponse.status}` }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } else {
      console.log('[Welcome Email] BACKEND_URL/INTERNAL_API_KEY not set, email not sent.')
    }

    console.log(`[Welcome Email] Sent to: ${email}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Welcome email processed', email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('[Welcome Email Error]', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to process welcome email',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
