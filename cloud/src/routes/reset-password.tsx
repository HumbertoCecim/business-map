import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '@/features/auth/auth.client'
import '@/features/business/business.css'
export const Route = createFileRoute('/reset-password')({ component: Reset })
function Reset() {
  const [password, setPassword] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  return <main className="business-cloud startup" data-theme="light"><form className="cloud-onboarding" onSubmit={async event => {
    event.preventDefault(); setBusy(true)
    try {
      const token = new URL(location.href).searchParams.get('token') ?? ''
      const result = await authClient.resetPassword({ token, newPassword: password })
      setMessage(result.error ? 'Este link expirou. Solicite outro no login.' : 'Senha atualizada. Você pode entrar na sua conta.')
    } finally { setBusy(false) }
  }}><div className="eyebrow">BUSINESS MAP</div><h1>Uma nova senha.</h1><label className="field"><span>Nova senha</span><input required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>Atualizar senha</button>{message && <p role="status">{message}</p>}<a href="/login">Voltar ao login</a></form></main>
}
