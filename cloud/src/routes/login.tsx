import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowRight, LockKeyhole, Mail, Map, LoaderCircle } from 'lucide-react'
import { authClient } from '@/features/auth/auth.client'
import { safeReturnTo } from '@/features/pilot/access'
import '@/features/business/business.css'

export const Route = createFileRoute('/login')({
  head: () => ({ meta: [{ title: 'Entrar · GrowYourPlan' }, { name: 'robots', content: 'noindex,nofollow' }] }),
  component: Login,
})
function Login() {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [password, setPassword] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const [signupAvailable, setSignupAvailable] = useState(false)
  useEffect(() => { void fetch('/api/pilot/status').then(response => response.json()).then((data: unknown) => setSignupAvailable(!!data && typeof data === 'object' && 'signupAvailable' in data && data.signupAvailable === true)).catch(() => {}); }, [])
  const returnTo = () => safeReturnTo(new URL(location.href).searchParams.get('returnTo'))
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (mode === 'register') {
        const result = await authClient.signUp.email({ name, email, password, callbackURL: returnTo() })
        if (result.error) throw new Error(result.error.message || 'Não foi possível criar a conta.')
        setNotice('Conta criada. Abra o e-mail de confirmação antes de entrar.'); setMode('login')
      } else if (mode === 'reset') {
        const result = await authClient.requestPasswordReset({ email, redirectTo: `${location.origin}/reset-password` })
        if (result.error) throw new Error(result.error.message || 'Não foi possível solicitar a recuperação.')
        setNotice('Se houver uma conta, você receberá as instruções por e-mail.')
      } else {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) throw new Error(result.error.message || 'Confira seu e-mail e senha.')
        location.assign(returnTo())
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Tente novamente.') }
    finally { setBusy(false) }
  }
  return <main className="business-cloud startup" data-theme="light" style={{ minHeight: '100dvh', padding: '32px 20px' }}>
    <div className="brand"><Map size={27}/><span>Grow<span className="brand-second">YourPlan</span></span></div>
    <form className="cloud-onboarding" onSubmit={submit} style={{ width: 'min(420px,100%)' }}>
      <div className="eyebrow">UM ESPAÇO PARA ENXERGAR MAIS LONGE</div>
      <h1>{mode === 'register' ? 'Seu negócio merece perspectiva.' : mode === 'reset' ? 'Vamos recuperar seu acesso.' : 'Bom ter você por aqui.'}</h1>
      <p>{mode === 'register' ? 'Este piloto é para convidados. Use o e-mail que recebeu acesso.' : 'Suas ideias, decisões e próximos passos, no mesmo mapa.'}</p>
      {mode === 'register' && <label className="field"><span>Seu nome</span><input autoComplete="name" required maxLength={150} value={name} onChange={e => setName(e.target.value)}/></label>}
      <label className="field"><span><Mail size={14}/> E-mail</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}/></label>
      {mode !== 'reset' && <label className="field"><span><LockKeyhole size={14}/> Senha</span><input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)}/></label>}
      {error && <p role="alert" className="notice">{error}</p>}{notice && <p role="status">{notice}</p>}
      {mode !== 'login' && !signupAvailable && <p role="status">O envio de e-mails do piloto ainda está sendo configurado. Contas existentes podem entrar normalmente.</p>}
      <button className="primary full" disabled={busy || mode !== 'login' && !signupAvailable}>{busy ? <LoaderCircle size={17}/> : <ArrowRight size={17}/>} {mode === 'register' ? 'Criar minha conta' : mode === 'reset' ? 'Enviar instruções' : 'Entrar no meu mapa'}</button>
      <div className="button-row" style={{ justifyContent: 'space-between', marginTop: 18 }}>
        <button type="button" className="text-button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>{mode === 'register' ? 'Já tenho uma conta' : 'Recebi um convite'}</button>
        <button type="button" className="text-button" onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setError(''); }}>{mode === 'reset' ? 'Voltar ao login' : 'Esqueci minha senha'}</button>
      </div>
      {signupAvailable && email && <button type="button" className="text-button" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try {
          const result = await authClient.sendVerificationEmail({ email, callbackURL: returnTo() })
          if (result.error) throw new Error('Não foi possível enviar agora. Tente novamente.')
          setNotice('Se houver uma conta aguardando confirmação, enviaremos as instruções por e-mail.')
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Tente novamente.') }
        finally { setBusy(false) }
      }}>Reenviar confirmação de e-mail</button>}
      <p className="small muted" style={{ marginTop: 30 }}>A inteligência fica no seu ChatGPT. Aqui, você mantém o controle do mapa.</p>
    </form>
  </main>
}
