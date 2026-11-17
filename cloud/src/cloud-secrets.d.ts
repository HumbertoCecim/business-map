/** Secret bindings are provisioned out of band; never store their values here. */
declare namespace Cloudflare {
  interface Env {
    BETTER_AUTH_SECRET: string
    APPROVAL_SECRET: string
    ADMIN_EMAILS?: string
    RESEND_API_KEY?: string
    GOOGLE_CLIENT_SECRET?: string
    GITHUB_CLIENT_SECRET?: string
    STRIPE_SECRET_KEY?: string
    STRIPE_WEBHOOK_SECRET?: string
    TURNSTILE_SECRET_KEY?: string
    PILOT_INVITE_EMAILS?: string
    APPROVED_CHATGPT_CLIENT_IDS?: string
  }
}
