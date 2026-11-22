import { FormEvent, useEffect, useRef, useState } from "react"

type Page = "Home" | "Agenda" | "Financeiro" | "Configurações"
type Status =
  | "Confirmado"
  | "Aguardando resposta"
  | "A confirmar"
  | "Desmarcou"
  | "Faltou"
type Reply = { title: string; text: string }
type Dialog =
  | { type: "debt" }
  | { type: "pay"; id: number }
  | { type: "response"; id: number }
  | { type: "queue"; ids: number[] }
  | null
type Appointment = {
  id: number
  patient: string
  phone: string
  date: string
  time: string
  procedure: string
  status: Status
  doctor?: string
  note?: string
  fresh?: boolean
  price?: number
  paid?: number
  installments?: number
  debtOnly?: boolean
}
type ActivityKind = "confirmação" | "lembrete" | "remarcação" | "cobrança"
type Activity = { id: number; kind: ActivityKind; patient: string; at: string }
type ClinicData = {
  name: string
  email: string
  whatsapp: string
  phone: string
  address: string
  team: string
  doctors: string[]
  confirmation: string
  reschedule: string
  charge: string
  replies: Reply[]
}
type EditingAppointment = {
  appointment: Appointment
  mode: "edit" | "reschedule"
} | null

function getLocalDateString(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const TODAY = getLocalDateString(new Date())

const CURRENT_MONDAY = (() => {
  const date = new Date()
  date.setHours(12, 0, 0, 0)

  const daysSinceMonday = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - daysSinceMonday)

  return date
})()

const money = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const initialAppointments: Appointment[] = []

const PRICES: Record<string, number> = {
  Limpeza: 180,
  Canal: 450,
  "Canal retorno": 200,
  Avaliação: 120,
  Clareamento: 600,
  Restauração: 350,
  Implante: 320,
  "Implante parcela": 320,
  "Limpeza e flúor": 300,
  "Manutenção de aparelho": 150,
}
const priceOf = (procedure: string) => PRICES[procedure] ?? 150
const daysBetween = (date: string) =>
  Math.round(
    (new Date(`${TODAY}T12:00:00`).getTime() -
      new Date(`${date}T12:00:00`).getTime()) /
      86400000,
  )

const owedOf = (item: Appointment) =>
  item.status === "Confirmado" && item.date < TODAY
    ? Math.max((item.price ?? 0) - (item.paid ?? 0), 0)
    : 0
const ALL_TIMES = Array.from({ length: 20 }, (_, index) => {
  const minutes = 8 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
})
const dayIndexOf = (date: string) =>
  (new Date(`${date}T12:00:00`).getDay() + 6) % 7
  function freeTimes(
    date: string,
    doctor: string,
    appointments: Appointment[],
    schedule: { enabled: boolean; hours: string }[],
    ignoreId?: number,
  ) {
      const day = schedule[dayIndexOf(date)]
    if (!day || !day.enabled) return []

    const now = new Date()
    const today = getLocalDateString(now)
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

    if (date < today) return []

    const [start, end] = day.hours.split(" às ")

    return ALL_TIMES.filter(
      (time) =>
        time >= start &&
        time < end &&
        (date > today || time > currentTime) &&
      !appointments.some(
        (item) =>
          item.id !== ignoreId &&
          item.date === date &&
          item.time === time &&
          (item.doctor ?? "") === doctor &&
          item.status !== "Desmarcou",
      ),
  )
}
function suggestSlots(
  doctor: string,
  appointments: Appointment[],
  schedule: { enabled: boolean; hours: string }[],
  ignoreId?: number,
) {
  const result: { date: string; time: string }[] = []
  for (let step = 1; step <= 21 && result.length < 3; step++) {
    const date = formatDate(addDays(new Date(`${TODAY}T12:00:00`), step))
    const times = freeTimes(date, doctor, appointments, schedule, ignoreId)
    if (times.length) result.push({ date, time: times[Math.floor(times.length / 3)] })
  }
  return result
}
function dateLabel(date: string) {
  const d = new Date(`${date}T12:00:00`)
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "long" })
  return `${weekday}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`
}
const fill = (template: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  )
const NO_PHONE_MESSAGE = "Cadastre o telefone do paciente para abrir o WhatsApp"
function openWhatsApp(phone: string, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (digits.length < 10) return false
  const number =
    digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`
  window.open(
    `https://wa.me/${number}?text=${encodeURIComponent(text)}`,
    "_blank",
  )
  return true
}
const paymentLabel = (item: Appointment) => {
  const paid = item.paid ?? 0
  const price = item.price ?? 0
  if (price > 0 && paid >= price) return "Pago"
  if (paid > 0) return "Parcial"
  return "Pendente"
}

const scheduleInitial = [
  { day: "Segunda", enabled: true, hours: "08:00 às 18:00" },
  { day: "Terça", enabled: true, hours: "08:00 às 18:00" },
  { day: "Quarta", enabled: true, hours: "08:00 às 18:00" },
  { day: "Quinta", enabled: true, hours: "08:00 às 18:00" },
  { day: "Sexta", enabled: true, hours: "08:00 às 17:00" },
  { day: "Sábado", enabled: true, hours: "08:00 às 12:00" },
  { day: "Domingo", enabled: false, hours: "08:00 às 12:00" },
]

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function CountUp({
  value,
  prefix = "",
  suffix = "",
}: {
  value: number
  prefix?: string
  suffix?: string
}) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let frame = 0
    const started = performance.now()
    const run = (now: number) => {
      const progress = Math.min((now - started) / 650, 1)
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))))
      if (progress < 1) frame = requestAnimationFrame(run)
    }
    frame = requestAnimationFrame(run)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return (
    <>
      {prefix}
      {display.toLocaleString("pt-BR")}
      {suffix}
    </>
  )
}

function Logo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLowerCase()
  return (
    <div className="brand-logo">
      {logoUrl ? (
        <img className="custom-logo" src={logoUrl} alt={`Logo ${name}`} />
      ) : (
        <>
          <div className="brand-symbol">
            <span>◡</span>
            <i />
            <b>{initials || "—"}</b>
          </div>
          <strong>{name.toUpperCase()}</strong>
        </>
      )}
    </div>
  )
}

function Sidebar({
  page,
  onChange,
  logoUrl,
  name,
}: {
  page: Page
  onChange: (page: Page) => void
  logoUrl?: string
  name: string
}) {
  const pages: Page[] = ["Home", "Agenda", "Financeiro", "Configurações"]
  const active = pages.indexOf(page)
  return (
    <aside className="sidebar">
      <Logo logoUrl={logoUrl} name={name} />
      <nav>
        <i
          className="active-rail"
          style={{ transform: `translateY(${active * 54}px)` }}
        />
        {pages.map((item) => (
          <button
            className={page === item ? "active" : ""}
            onClick={() => onChange(item)}
            key={item}
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  )
}

function Header({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children?: React.ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {children}
    </header>
  )
}

function StatCard({
  value,
  label,
  delay = 0,
  moneyValue = false,
}: {
  value: number
  label: string
  delay?: number
  moneyValue?: boolean
}) {
  return (
    <div className="stat-card reveal" style={{ animationDelay: `${delay}ms` }}>
      <strong>
        {moneyValue ? (
          <>
            <span>R$ </span>
            <CountUp value={value} />
          </>
        ) : (
          <CountUp value={value} />
        )}
      </strong>
      <small>{label}</small>
    </div>
  )
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`status status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      {status}
    </span>
  )
}

function Home({
  appointments,
  newAppointment,
  editAppointment,
  sendConfirmation,
  openResponse,
  openQueue,
  markPaid,
}: {
  appointments: Appointment[]
  newAppointment: () => void
  markPaid: (item: Appointment) => void
  editAppointment: (item: Appointment, mode?: "edit" | "reschedule") => void
  sendConfirmation: (item: Appointment) => void
  openResponse: (item: Appointment) => void
  openQueue: () => void
}) {
  const today = appointments
    .filter((item) => item.date === TODAY)
    .sort((a, b) => a.time.localeCompare(b.time))
  const counts = {
    confirmed: today.filter((item) => item.status === "Confirmado").length,
    pending: today.filter((item) =>
      ["A confirmar", "Aguardando resposta"].includes(item.status),
    ).length,
    canceled: today.filter((item) => item.status === "Desmarcou").length,
  }
  const currentMonth = TODAY.slice(0, 7)

  const missed = appointments.filter(
    (item) =>
      item.date.startsWith(currentMonth) &&
      item.status === "Faltou",
  ).length
  return (
    <>
      <Header
        title="Home"
        subtitle={`${dateLabel(TODAY)} · ${today.length} consultas · vindo da agenda`}
      >
        <div className="header-actions">
          <button className="secondary" onClick={openQueue}>
            Confirmar pendentes
          </button>
          <button className="primary" onClick={newAppointment}>
            + Nova consulta
          </button>
        </div>
      </Header>
      <section className="stats five">
        <StatCard value={counts.confirmed} label="confirmados" />
        <StatCard value={counts.pending} label="pendentes" delay={60} />
        <StatCard value={counts.canceled} label="desmarcou" delay={120} />
        <StatCard value={missed} label="faltas no mês" delay={180} />
        <StatCard value={today.length} label="no dia" delay={240} />
      </section>
      <section
        className="table-card reveal"
        style={{ animationDelay: "220ms" }}
      >
        <div className="table-head home-grid">
          <span>Hora</span>
          <span>Paciente</span>
          <span>Procedimento</span>
          <span>Status</span>
          <span>Ações</span>
        </div>
        {today.length === 0 && (
          <div className="table-row empty-row">Nenhuma consulta para hoje</div>
        )}
        {today.map((item, index) => (
          <div
            className="table-row home-grid cascade"
            style={{ animationDelay: `${280 + index * 60}ms` }}
            key={item.id}
          >
            <strong>{item.time}</strong>
            <span className="patient-name">
              <strong>{item.patient}</strong>
              <small>
                {item.doctor ? `${item.doctor} · ` : ""}
                {paymentLabel(item)}
              </small>
            </span>
            <span>{item.procedure}</span>
            <StatusBadge status={item.status} />
            <div className="action-cell">
              <button
                className="soft compact"
                onClick={() => editAppointment(item)}
              >
                Editar
              </button>
              {item.status === "A confirmar" && (
                <button
                  className="primary compact action-vanish"
                  onClick={() => sendConfirmation(item)}
                >
                  Confirmar
                </button>
              )}
              {item.status === "Aguardando resposta" && (
                <button
                  className="primary compact action-vanish"
                  onClick={() => openResponse(item)}
                >
                  Marcar resposta
                </button>
              )}
              {item.status === "Confirmado" && (
                <button
                  className="soft compact"
                  onClick={() => openResponse(item)}
                >
                  Faltou?
                </button>
              )}
              {item.status === "Confirmado" &&
                (item.price ?? 0) > 0 &&
                paymentLabel(item) !== "Pago" && (
                  <button
                    className="soft compact"
                    onClick={() => markPaid(item)}
                  >
                    Marcar pago
                  </button>
                )}
              {item.status === "Desmarcou" && (
                <button
                  className="primary compact action-vanish"
                  onClick={() => editAppointment(item, "reschedule")}
                >
                  Remarcar
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </>
  )
}

function AppointmentForm({
  initialDate,
  initialTime,
  onCancel,
  onSave,
  doctors,
  appointments,
  schedule,
}: {
  initialDate: string
  initialTime: string
  onCancel: () => void
  onSave: (appointment: Omit<Appointment, "id" | "status">) => void
  doctors: string[]
  appointments: Appointment[]
  schedule: { enabled: boolean; hours: string }[]
}) {
  const [type, setType] = useState("Avaliação")
  const [doctor, setDoctor] = useState(doctors[0])
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [price, setPrice] = useState(String(priceOf("Avaliação")))
  const free = freeTimes(date, doctor, appointments, schedule)
  const chosen = free.includes(time) ? time : (free[0] ?? "")
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const availableNow = freeTimes(date, doctor, appointments, schedule)

    if (!chosen || !availableNow.includes(chosen)) {
      alert("Este horário não está mais disponível. Selecione outro horário.")
      setTime("")
      return
    }
    const data = new FormData(event.currentTarget)
    onSave({
      patient: String(data.get("patient")),
      phone: String(data.get("phone")),
      date,
      time: chosen,
      procedure: type,
      doctor,
      note: String(data.get("note")),
      price: Number(price) || 0,
      paid: 0,
    })
  }
  return (
    <form className="appointment-form" onSubmit={submit}>
      <h2>Nova consulta</h2>
      <p>Aparece na agenda, na Home e no Financeiro</p>
      <label>
        Paciente *
        <input name="patient" placeholder="Nome do paciente" required />
      </label>
      <label>
        Telefone (WhatsApp)
        <input name="phone" placeholder="(11) 99999-9999" />
      </label>
      <label>
        Profissional
        <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
          {doctors.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label>
          Data
          <input
            type="date"
            value={date}
            min={getLocalDateString(new Date())}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </label>
        <label>
          Horário (livres)
          <select
            value={chosen}
            onChange={(e) => setTime(e.target.value)}
            disabled={!free.length}
          >
            {free.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {!free.length && (
        <p className="warn">Sem horário livre neste dia. Escolha outra data.</p>
      )}
      <fieldset>
        <legend>Tipo de consulta</legend>
        <div className="chips">
          {[
            "Avaliação",
            "Limpeza",
            "Canal",
            "Restauração",
            "Clareamento",
            "Outro",
          ].map((item) => (
            <button
              type="button"
              className={type === item ? "active" : ""}
              onClick={() => {
                setType(item)
                setPrice(String(priceOf(item)))
              }}
              key={item}
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>
      <label>
        Valor da consulta (R$)
        <input
          type="number"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label>
        Observação (opcional)
        <textarea name="note" rows={3} />
      </label>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="primary" disabled={!chosen}>
          Salvar consulta
        </button>
      </div>
    </form>
  )
}

function Agenda({
  appointments,
  weekOffset,
  direction,
  changeWeek,
  resetWeek,
  formOpen,
  setFormOpen,
  addAppointment,
  openDetails,
  doctors,
  schedule,
}: {
  appointments: Appointment[]
  weekOffset: number
  direction: "next" | "prev"
  changeWeek: (step: number) => void
  resetWeek: () => void
  formOpen: boolean
  setFormOpen: (open: boolean) => void
  addAppointment: (appointment: Omit<Appointment, "id" | "status">) => void
  openDetails: (item: Appointment) => void
  doctors: string[]
  schedule: { enabled: boolean; hours: string }[]
}) {
  const [prefill, setPrefill] = useState<{ date: string; time: string } | null>(
    null,
  )
  const [doctorFilter, setDoctorFilter] = useState("Todos os profissionais")
  const monday = addDays(CURRENT_MONDAY, weekOffset * 7)
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(monday, index),
  )
  const labels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
  const times = [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
  ]
  const subtitle = `Semana de ${monday.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}`
  return (
    <>
      <Header title="Agenda" subtitle={subtitle}>
        <button
          className="primary"
          onClick={() => {
            setPrefill(null)
            setFormOpen(true)
          }}
        >
          + Nova consulta
        </button>
      </Header>
      <div className={`agenda-layout ${formOpen ? "with-form" : ""}`}>
        <section className="calendar-section">
          <div className="week-selector">
            <button className="square" onClick={() => changeWeek(-1)}>
              ‹
            </button>
            <strong>
              {monday.toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}{" "}
              a{" "}
              {weekDays[6].toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </strong>
            <button className="square" onClick={() => changeWeek(1)}>
              ›
            </button>
            <button className="soft" onClick={resetWeek}>
              Hoje
            </button>
            <select
              className="doctor-filter"
              value={doctorFilter}
              onChange={(event) => setDoctorFilter(event.target.value)}
            >
              <option>Todos os profissionais</option>
              {doctors.map((doctor) => (
                <option key={doctor}>{doctor}</option>
              ))}
            </select>
          </div>
          <div className={`calendar slide-${direction}`} key={weekOffset}>
            <div className="calendar-head">
              <span />
              {weekDays.map((day, index) => (
                <div
                  className={formatDate(day) === TODAY ? "today-column" : ""}
                  key={formatDate(day)}
                >
                  <small>{labels[index]}</small>
                  <strong>{String(day.getDate()).padStart(2, "0")}</strong>
                </div>
              ))}
            </div>
            <div className="calendar-content">
              <div className="times">
                {times.map((time) => (
                  <span key={time}>{time}</span>
                ))}
              </div>
              <div className="days-grid">
                {weekDays.map((day, dayIndex) => (
                  <div
                    className={`day-column ${
                      !schedule[dayIndex].enabled ? "closed-day" : ""
                    }`}
                    key={formatDate(day)}
                  >
                    {times.map((time) => {
                      const [start, end] = schedule[dayIndex].hours.split(" às ")

                      const now = new Date()
                      const todayDate = getLocalDateString(now)
                      const selectedDate = formatDate(day)

                      const currentTime =
                        `${String(now.getHours()).padStart(2, "0")}:` +
                        `${String(now.getMinutes()).padStart(2, "0")}`

                      const isPast =
                        selectedDate < todayDate ||
                        (selectedDate === todayDate && time <= currentTime)

                      const closed =
                        !schedule[dayIndex].enabled ||
                        time < start ||
                        time >= end ||
                        isPast
                      return (
                        <button
                          className="time-cell"
                          disabled={closed}
                          aria-label={`Nova consulta em ${formatDate(day)} às ${time}`}
                          onClick={() => {
                            setPrefill({ date: formatDate(day), time })
                            setFormOpen(true)
                          }}
                          key={time}
                        />
                      )
                    })}
                    {appointments
                      .filter(
                        (item) =>
                          !item.debtOnly &&
                          item.date === formatDate(day) &&
                          (doctorFilter === "Todos os profissionais" ||
                            (item.doctor ?? "") ===
                              doctorFilter),
                      )
                      .map((item, index) => {
                        const hour = Number(item.time.slice(0, 2))
                        const minutes = Number(item.time.slice(3))
                        const top = (hour - 8 + minutes / 60) * 48 + 3
                        return (
                          <button
                            className={`calendar-event event-${item.status.toLowerCase().replaceAll(" ", "-")} ${
                              item.fresh ? "fresh" : ""
                            }`}
                            style={{
                              top,
                              animationDelay: `${dayIndex * 60 + index * 35}ms`,
                            }}
                            onClick={() => openDetails(item)}
                            key={item.id}
                          >
                            <strong>{item.patient}</strong>
                            <small>
                              {item.doctor ?? ""}
                            </small>
                          </button>
                        )
                      })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        {formOpen && (
          <AppointmentForm
            key={`${prefill?.date}-${prefill?.time}`}
            initialDate={
              prefill?.date ?? (weekOffset === 0 ? TODAY : formatDate(monday))
            }
            initialTime={prefill?.time ?? "09:00"}
            onCancel={() => setFormOpen(false)}
            onSave={addAppointment}
            doctors={doctors}
            appointments={appointments}
            schedule={schedule}
          />
        )}
      </div>
    </>
  )
}

function Financeiro({
  appointments,
  charged,
  charge,
  openPay,
  payFull,
  exportCsv,
  addDebt,
}: {
  appointments: Appointment[]
  addDebt: () => void
  charged: string[]
  charge: (item: Appointment) => void
  openPay: (item: Appointment) => void
  payFull: (item: Appointment) => void
  exportCsv: () => void
}) {
  const currentMonth = getLocalDateString(new Date()).slice(0, 7)

  const monthAppointments = appointments.filter((item) =>
    item.date.startsWith(currentMonth),
  )

  const debts = appointments
    .filter((item) => owedOf(item) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const received = monthAppointments.reduce(
    (sum, item) => sum + (item.paid ?? 0),
    0,
  )
  const toReceive = debts.reduce((sum, item) => sum + owedOf(item), 0)
  const monthCount = monthAppointments.filter(
    (item) => item.status !== "Desmarcou" && !item.debtOnly,
  ).length
  const maxDelay = debts.length ? daysBetween(debts[0].date) : 0
  const payments = appointments
    .filter((item) => (item.paid ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4)
  const monthlyReceived = Array.from({ length: 6 }, (_, index) => {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - (5 - index))

  const month = date.getMonth()
  const year = date.getFullYear()

  const total = appointments
    .filter((item) => {
      const itemDate = new Date(`${item.date}T12:00:00`)

      return (
        itemDate.getMonth() === month &&
        itemDate.getFullYear() === year
      )
    })
    .reduce((sum, item) => sum + (item.paid ?? 0), 0)

  return {
    label: date
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", ""),
    total,
  }
})

const maxReceived = Math.max(
  ...monthlyReceived.map((item) => item.total),
  1,
)

const bars = monthlyReceived.map((item) => ({
  ...item,
  height: item.total > 0 ? Math.max(5, (item.total / maxReceived) * 100) : 0,
}))

  const grid = { gridTemplateColumns: "1.05fr 1.05fr .6fr .9fr 2fr" }
  return (
    <>
      <Header
        title="Financeiro"
        subtitle={`${new Date().toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        })} · ligado às consultas da agenda`}
      >
        <div className="header-actions">
          <button className="secondary" onClick={addDebt}>
            + Dívida antiga
          </button>
          <button className="secondary" onClick={exportCsv}>
            Exportar planilha
          </button>
        </div>
      </Header>
      <section className="stats">
        <StatCard value={received} label="recebido no mês" moneyValue />
        <StatCard value={toReceive} label="a receber" moneyValue delay={60} />
        <StatCard value={monthCount} label="consultas no mês" delay={120} />
        <StatCard value={maxDelay} label="dias de maior atraso" delay={180} />
      </section>
      <div className="finance-panels">
        <section className="panel reveal" style={{ animationDelay: "230ms" }}>
          <h2>Recebido por mês</h2>
          <div className="chart">
            {bars.map((item, index) => (
              <div
                className="bar-wrap"
                style={
                  {
                    "--height": `${item.height}%`,
                    animationDelay: `${320 + index * 80}ms`,
                  } as React.CSSProperties
                }
                data-value={money(item.total)}
                key={index}
              >
                <i />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel reveal" style={{ animationDelay: "290ms" }}>
          <h2>Últimos pagamentos</h2>
          {payments.length === 0 && (
            <p className="muted-note">Nenhum pagamento registrado ainda.</p>
          )}
          {payments.map((item, index) => (
            <div
              className="payment-row cascade"
              style={{ animationDelay: `${360 + index * 60}ms` }}
              key={item.id}
            >
              <span>
                <strong>{item.patient}</strong> · {item.procedure}
              </span>
              <b>{money(item.paid ?? 0)}</b>
              <i>{paymentLabel(item)}</i>
            </div>
          ))}
        </section>
      </div>
      <section
        className="table-card debt-table reveal"
        style={{ animationDelay: "480ms" }}
      >
        <div className="table-head debt-grid" style={grid}>
          <span>Paciente</span>
          <span>Referente a</span>
          <span>Atraso</span>
          <span>Situação</span>
          <span>Ação</span>
        </div>
        {debts.length === 0 && (
          <div className="table-row empty-row">Ninguém devendo</div>
        )}
        {debts.map((item, index) => {
          const owed = owedOf(item)
          const plan =
            item.installments && item.installments > 1
              ? ` · ${item.installments}× de ${money(owed / item.installments)}`
              : ""
          return (
            <div
              className="table-row debt-grid cascade"
              style={{ ...grid, animationDelay: `${520 + index * 60}ms` }}
              key={item.id}
            >
              <span>
                <strong>{item.patient}</strong>
                <small>{money(owed)}</small>
              </span>
              <span>{item.procedure}</span>
              <span>{daysBetween(item.date)} dias</span>
              <span>
                {paymentLabel(item)}
                <small>{plan.replace(" · ", "")}</small>
              </span>
              <div className="action-cell">
                <button
                  className={`charge-button compact ${
                    charged.includes(item.patient) ? "sent" : ""
                  }`}
                  onClick={() => charge(item)}
                >
                  {charged.includes(item.patient)
                    ? "Cobrar de novo"
                    : "Cobrar no WhatsApp"}
                </button>
                <button className="soft compact" onClick={() => openPay(item)}>
                  Registrar pagamento
                </button>
                <button
                  className="primary compact"
                  onClick={() => payFull(item)}
                >
                  Marcar como pago
                </button>
              </div>
            </div>
          )
        })}
      </section>
    </>
  )
}

function Settings({
  schedule,
  toggleDay,
  brandColor,
  setBrandColor,
  dark,
  toggleTheme,
  clinic,
  openSetting,
  uploadLogo,
  activity,
  exportBackup,
  importBackup,
  exportActivity,
}: {
  activity: Activity[]
  exportBackup: () => void
  importBackup: (file: File) => void
  exportActivity: () => void
  schedule: typeof scheduleInitial
  toggleDay: (index: number) => void
  brandColor: string
  setBrandColor: (color: string) => void
  dark: boolean
  toggleTheme: () => void
  clinic: ClinicData
  openSetting: (setting: string) => void
  uploadLogo: (file: File) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const countOf = (kind: ActivityKind) =>
    activity.filter((item) => item.kind === kind).length
  const EditRow = ({
    label,
    value,
    action = "Editar",
  }: {
    label: string
    value: string
    action?: string
  }) => (
    <div className="setting-row">
      <span>
        <strong>{label}</strong>
        <small>{value || "Não informado"}</small>
      </span>
      <button className="soft compact" onClick={() => openSetting(label)}>
        {action}
      </button>
    </div>
  )
  const panels = [
    <section className="panel" key="identity">
      <h2>Identidade da clínica</h2>
      <EditRow label="Nome da clínica" value={clinic.name} />
      <div className="setting-row">
        <span>
          <strong>Logo</strong>
          <small>Logo exibida no menu lateral</small>
        </span>
        <button
          className="soft compact"
          onClick={() => fileRef.current?.click()}
        >
          Enviar imagem
        </button>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/*"
          onChange={(event) =>
            event.target.files?.[0] && uploadLogo(event.target.files[0])
          }
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>Cor da marca</strong>
          <small>{brandColor.toUpperCase()}</small>
        </span>
        <input
          className="color-input"
          type="color"
          value={brandColor}
          onChange={(event) => setBrandColor(event.target.value)}
        />
      </div>
      <div className="setting-row">
        <span>
          <strong>Tema</strong>
          <small>{dark ? "Escuro" : "Claro"}</small>
        </span>
        <button className="soft compact" onClick={toggleTheme}>
          {dark ? "Usar claro" : "Claro / escuro"}
        </button>
      </div>
    </section>,
    <section className="panel" key="account">
      <h2>Conta</h2>
      <EditRow label="E-mail" value={clinic.email} />
    </section>,
    <section className="panel clinic-data" key="data">
      <h2>Dados da clínica</h2>
      <EditRow label="WhatsApp da clínica" value={clinic.whatsapp} />
      <EditRow label="Telefone" value={clinic.phone} />
      <EditRow label="Endereço" value={clinic.address} />
      <EditRow label="Equipe" value={clinic.team.split("\n").join(", ")} />
      <EditRow label="Profissionais" value={clinic.doctors.join(", ")} />
    </section>,
    <section className="panel schedule-panel" key="schedule">
      <h2>Dias de atendimento</h2>
      {schedule.map((item, index) => (
        <div className="schedule-row" key={item.day}>
          <button
            className={`toggle ${item.enabled ? "on" : ""}`}
            onClick={() => toggleDay(index)}
            aria-label={`${item.enabled ? "Desligar" : "Ligar"} ${item.day}`}
          >
            <i />
          </button>
          <strong>{item.day}</strong>
          <button
            className="hours-button"
            disabled={!item.enabled}
            onClick={() => openSetting(`Horário|${index}`)}
          >
            <span key={String(item.enabled)} className="hours-fade">
              {item.enabled ? item.hours : "— às —"}
            </span>
          </button>
        </div>
      ))}
    </section>,
    <section className="panel" key="messages">
      <h2>Mensagens do WhatsApp</h2>
      <EditRow label="Confirmação" value={clinic.confirmation} />
      <EditRow label="Remarcação" value={clinic.reschedule} />
      <EditRow label="Cobrança" value={clinic.charge} />
    </section>,
    <section className="panel" key="backup">
      <h2>Dados e uso</h2>
      <p className="muted-note">
        Os dados ficam salvos só neste aparelho e navegador. Baixe um backup
        de vez em quando e não limpe os dados do navegador.
      </p>
      <div className="setting-row">
        <span>
          <strong>Backup</strong>
          <small>Baixar ou restaurar um arquivo com todos os dados</small>
        </span>
        <div className="action-cell">
          <button className="soft compact" onClick={exportBackup}>
            Baixar
          </button>
          <button
            className="soft compact"
            onClick={() => backupRef.current?.click()}
          >
            Restaurar
          </button>
          <input
            ref={backupRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) importBackup(file)
              event.target.value = ""
            }}
          />
        </div>
      </div>
      <p className="muted-note">
        Mensagens abertas no WhatsApp: {countOf("confirmação")} confirmações,{" "}
        {countOf("lembrete")} lembretes, {countOf("remarcação")} remarcações e{" "}
        {countOf("cobrança")} cobranças.
      </p>
      <div className="setting-row">
        <span>
          <strong>Registro de uso</strong>
          <small>Data, tipo e paciente de cada mensagem</small>
        </span>
        <button className="soft compact" onClick={exportActivity}>
          Baixar registro
        </button>
      </div>
    </section>,
    <section className="panel" key="replies">
      <h2>Respostas prontas</h2>
      <p className="muted-note">
        Textos para a recepção copiar. Revise com o profissional responsável antes de usar.
      </p>
      {clinic.replies.map((reply, index) => (
        <div className="setting-row" key={reply.title}>
          <span>
            <strong>{reply.title}</strong>
            <small>{reply.text.slice(0, 64)}…</small>
          </span>
          <button
            className="soft compact"
            onClick={() => openSetting(`Resposta|${index}`)}
          >
            Abrir
          </button>
        </div>
      ))}
    </section>,
  ]
  return (
    <>
      <Header
        title="Configurações"
        subtitle="Dados da clínica, conta e agenda"
      />
      <div className="settings-grid">
        {panels.map((panel, index) => (
          <div
            className={`panel-reveal ${index === 3 ? "schedule-wrapper" : ""}`}
            style={{ animationDelay: `${index * 70}ms` }}
            key={index}
          >
            {panel}
          </div>
        ))}
      </div>
    </>
  )
}

function ModalShell({
  children,
  close,
}: {
  children: React.ReactNode
  close: () => void
}) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => event.key === "Escape" && close()
    window.addEventListener("keydown", keydown)
    return () => window.removeEventListener("keydown", keydown)
  }, [close])
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={close}>
          ×
        </button>
        {children}
      </div>
    </div>
  )
}

function AppointmentModal({
  editing,
  doctors,
  appointments,
  schedule,
  clinic,
  close,
  save,
  unbook,
  notify,
  logActivity,
}: {
  logActivity: (kind: ActivityKind, patient: string) => void
  editing: NonNullable<EditingAppointment>
  doctors: string[]
  appointments: Appointment[]
  schedule: { enabled: boolean; hours: string }[]
  clinic: ClinicData
  close: () => void
  save: (appointment: Appointment) => void
  unbook: (id: number) => void
  notify: (text: string) => void
}) {
  const item = editing.appointment
  const reschedule = editing.mode === "reschedule"
  const [doctor, setDoctor] = useState(item.doctor ?? doctors[0])
  const [date, setDate] = useState(item.date)
  const [time, setTime] = useState(item.time)
  const free = freeTimes(date, doctor, appointments, schedule, item.id)

  const unchangedSlot =
    !reschedule &&
    date === item.date &&
    time === item.time &&
    doctor === (item.doctor ?? doctors[0])

  const options =
    unchangedSlot && !free.includes(time)
      ? [time, ...free]
      : free

  const suggestions = suggestSlots(doctor, appointments, schedule, item.id)
  const sendOptions = () => {
    const list = suggestions
      .map((slot, i) => `${i + 1}) ${dateLabel(slot.date)} às ${slot.time}`)
      .join("\n")
    const opened = openWhatsApp(
      item.phone,
      fill(clinic.reschedule, { paciente: item.patient, data: "", hora: "" })
        .split(" Podemos")[0] + `\nTemos estas opções:\n${list}\nQual fica melhor para você?`,
    )
    if (!opened) return notify(NO_PHONE_MESSAGE)
    logActivity("remarcação", item.patient)
    notify("Opções abertas no WhatsApp")
  }
  return (
    <ModalShell close={close}>
      <h2>{reschedule ? "Remarcar consulta" : "Editar consulta"}</h2>
      <p className="modal-subtitle">
        Altere o que for preciso, por exemplo em caso de imprevisto.
      </p>
      {reschedule && (
        <div className="suggest-box">
          <strong>3 horários livres sugeridos</strong>
          <div className="slot-chips">
            {suggestions.map((slot) => (
              <button
                type="button"
                className={
                  slot.date === date && slot.time === time ? "active" : ""
                }
                onClick={() => {
                  setDate(slot.date)
                  setTime(slot.time)
                }}
                key={slot.date + slot.time}
              >
                {dateLabel(slot.date)} · {slot.time}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="soft compact"
            onClick={sendOptions}
            disabled={!suggestions.length}
          >
            Enviar opções no WhatsApp
          </button>
          {!suggestions.length && (
            <small>Sem horário livre. Escolha a data manualmente abaixo.</small>
          )}
        </div>
      )}
      <form
        onSubmit={(event) => {
        event.preventDefault()

        const sameSlot =
          !reschedule &&
          date === item.date &&
          time === item.time &&
          doctor === (item.doctor ?? doctors[0])

        const availableNow = freeTimes(
          date,
          doctor,
          appointments,
          schedule,
          item.id,
        )

        if (!sameSlot && !availableNow.includes(time)) {
          notify("Horário indisponível. Escolha outra data ou horário.")
          return
        }

        const data = new FormData(event.currentTarget)
        save({
            ...item,
            patient: String(data.get("patient")),
            doctor,
            date,
            time,
            procedure: String(data.get("procedure")),
            status: String(data.get("status")) as Status,
            note: String(data.get("note")),
            price: Number(data.get("price")) || 0,
          })
        }}
      >
        <label className="modal-field">
          Paciente
          <input name="patient" defaultValue={item.patient} required />
        </label>
        <label className="modal-field">
          Profissional
          <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            {doctors.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <div className="modal-fields">
          <label className="modal-field">
            Data
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="modal-field">
            Horário
            <select
              value={options.includes(time) ? time : ""}
              onChange={(e) => setTime(e.target.value)}
              disabled={!options.length}
              required
            >
              <option value="" disabled>
                Selecione um horário
              </option>

              {options.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-fields">
          <label className="modal-field">
            Procedimento
            <input name="procedure" defaultValue={item.procedure} required />
          </label>
          <label className="modal-field">
            Status
            <select
              name="status"
              defaultValue={reschedule ? "A confirmar" : item.status}
            >
              {(
                [
                  "Confirmado",
                  "Aguardando resposta",
                  "A confirmar",
                  "Desmarcou",
                  "Faltou",
                ] as Status[]
              ).map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="modal-fields">
          <label className="modal-field">
            Valor (R$)
            <input
              name="price"
              type="number"
              min="0"
              defaultValue={item.price ?? 0}
            />
          </label>
          <label className="modal-field">
            Pagamento
            <input value={`${paymentLabel(item)} · ${money(item.paid ?? 0)} pago`} readOnly />
          </label>
        </div>
        <label className="modal-field">
          Observação
          <textarea name="note" rows={3} defaultValue={item.note} />
        </label>
        <div className="modal-actions">
          <button
            type="button"
            className="danger-soft"
            onClick={() => unbook(item.id)}
          >
            Desmarcar
          </button>
          <span />
          <button type="button" className="secondary" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar alterações</button>
        </div>
      </form>
    </ModalShell>
  )
}

function DebtModal({
  close,
  save,
  latestDate,
}: {
  close: () => void
  save: (data: {
    patient: string
    phone: string
    amount: number
    date: string
    procedure: string
  }) => void
  latestDate: string
}) {
  return (
    <ModalShell close={close}>
      <h2>Dívida antiga</h2>
      <p className="modal-subtitle">
        Lance quem já deve de antes, para aparecer em "Quem deve".
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const amount = Number(data.get("amount"))
          if (!(amount > 0)) return
          save({
            patient: String(data.get("patient")).trim(),
            phone: String(data.get("phone")),
            amount,
            date: String(data.get("date")),
            procedure: String(data.get("procedure")).trim() || "Saldo anterior",
          })
        }}
      >
        <label className="modal-field">
          Paciente
          <input name="patient" required />
        </label>
        <label className="modal-field">
          Telefone (WhatsApp)
          <input name="phone" placeholder="(11) 99999-9999" />
        </label>
        <div className="modal-fields">
          <label className="modal-field">
            Valor devido (R$)
            <input name="amount" type="number" min="1" step="0.01" required />
          </label>
          <label className="modal-field">
            Data da consulta
            <input name="date" type="date" max={latestDate} required />
          </label>
        </div>
        <label className="modal-field">
          Referente a
          <input name="procedure" placeholder="Ex.: Canal, parcela do implante" />
        </label>
        <div className="simple-modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar dívida</button>
        </div>
      </form>
    </ModalShell>
  )
}

function PaymentModal({
  item,
  close,
  save,
}: {
  item: Appointment
  close: () => void
  save: (amount: number, installments: number) => void
}) {
  const owed = owedOf(item)
  const [amount, setAmount] = useState(String(owed))
  const [installments, setInstallments] = useState(1)
  const remaining = Math.max(owed - (Number(amount) || 0), 0)
  return (
    <ModalShell close={close}>
      <h2>Registrar pagamento</h2>
      <p className="modal-subtitle">
        {item.patient} · {item.procedure} · em aberto {money(owed)}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const value = Number(amount)
          if (!(value > 0) || value > owed) return
          save(value, remaining > 0 ? installments : 1)
        }}
      >
        <label className="modal-field">
          Valor recebido agora (R$)
          <input
            type="number"
            min="1"
            max={owed}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
        {remaining > 0 && (
          <label className="modal-field">
            Parcelar o restante ({money(remaining)}) em
            <select
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 6].map((n) => (
                <option value={n} key={n}>
                  {n}× de {money(remaining / n)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="simple-modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Registrar pagamento</button>
        </div>
      </form>
    </ModalShell>
  )
}

function ResponseModal({
  item,
  close,
  respond,
  remind,
}: {
  item: Appointment
  close: () => void
  respond: (status: Status) => void
  remind: () => void
}) {
  return (
    <ModalShell close={close}>
      <h2>Marcar resposta</h2>
      <p className="modal-subtitle">
        {item.patient} · {item.time} · {item.procedure}
      </p>
      <div className="slot-chips">
        <button onClick={() => respond("Confirmado")}>Confirmou</button>
        <button onClick={() => respond("Desmarcou")}>Desmarcou</button>
        <button onClick={() => respond("Faltou")}>Faltou</button>
      </div>
      {item.status === "Aguardando resposta" && (
        <button className="soft wide" style={{ marginTop: 16 }} onClick={remind}>
          Reenviar lembrete no WhatsApp
        </button>
      )}
    </ModalShell>
  )
}

function QueueModal({
  items,
  close,
  send,
}: {
  items: Appointment[]
  close: () => void
  send: (item: Appointment) => void
}) {
  const [index, setIndex] = useState(0)
  const current = items[index]
  return (
    <ModalShell close={close}>
      <h2>Confirmar pendentes</h2>
      {current ? (
        <>
          <p className="modal-subtitle">
            Paciente {index + 1} de {items.length}. Nada é enviado sozinho.
          </p>
          <div className="detail-card">
            <strong>{current.patient}</strong>
            <span>
              {current.time} · {current.procedure}
            </span>
          </div>
          <div className="simple-modal-actions">
            <button className="secondary" onClick={() => setIndex(index + 1)}>
              Pular
            </button>
            <button
              className="primary"
              onClick={() => {
                send(current)
                setIndex(index + 1)
              }}
            >
              Abrir no WhatsApp
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="detail-card">
            <strong>Tudo certo</strong>
            <span>Todos os pendentes de hoje foram tratados.</span>
          </div>
          <button className="primary wide" onClick={close}>
            Fechar
          </button>
        </>
      )}
    </ModalShell>
  )
}

function SettingModal({
  setting,
  clinic,
  schedule,
  close,
  updateClinic,
  updateHours,
  notify,
}: {
  setting: string
  clinic: ClinicData
  schedule: typeof scheduleInitial
  close: () => void
  updateClinic: (data: Partial<ClinicData>) => void
  updateHours: (index: number, hours: string) => void
  notify: (text: string) => void
}) {
  const hourIndex = setting.startsWith("Horário|")
    ? Number(setting.split("|")[1])
    : -1
  const fieldMap: Record<string, keyof ClinicData> = {
    "Nome da clínica": "name",
    "E-mail": "email",
    "WhatsApp da clínica": "whatsapp",
    Telefone: "phone",
    Endereço: "address",
    Equipe: "team",
    Profissionais: "doctors",
    Confirmação: "confirmation",
    Remarcação: "reschedule",
    Cobrança: "charge",
  }
  const key = fieldMap[setting]
  if (hourIndex >= 0) {
    const [start, end] = schedule[hourIndex].hours.split(" às ")
    return (
      <ModalShell close={close}>
        <h2>Horário de {schedule[hourIndex].day}</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const nextStart = String(data.get("start"))
            const nextEnd = String(data.get("end"))
            if (nextEnd <= nextStart)
              return notify("O horário final precisa ser depois do início")
            updateHours(hourIndex, `${nextStart} às ${nextEnd}`)
            close()
            notify(`Horário de ${schedule[hourIndex].day} atualizado`)
          }}
        >
          <div className="modal-fields">
            <label className="modal-field">
              Início
              <input name="start" type="time" defaultValue={start} required />
            </label>
            <label className="modal-field">
              Fim
              <input name="end" type="time" defaultValue={end} required />
            </label>
          </div>
          <div className="simple-modal-actions">
            <button type="button" className="secondary" onClick={close}>
              Cancelar
            </button>
            <button className="primary">Salvar</button>
          </div>
        </form>
      </ModalShell>
    )
  }
  if (setting.startsWith("Resposta|")) {
    const index = Number(setting.split("|")[1])
    const reply = clinic.replies[index]
    return (
      <ModalShell close={close}>
        <h2>Resposta pronta</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            updateClinic({
              replies: clinic.replies.map((r, i) =>
                i === index
                  ? { title: String(data.get("title")), text: String(data.get("text")) }
                  : r,
              ),
            })
            close()
            notify("Resposta atualizada")
          }}
        >
          <label className="modal-field">
            Título
            <input name="title" defaultValue={reply.title} required />
          </label>
          <label className="modal-field">
            Texto
            <textarea name="text" rows={6} defaultValue={reply.text} required />
          </label>
          <div className="simple-modal-actions">
            <button
              type="button"
              className="soft"
              onClick={() => {
                navigator.clipboard?.writeText(reply.text)
                notify("Resposta copiada")
              }}
            >
              Copiar
            </button>
            <button type="button" className="secondary" onClick={close}>
              Cancelar
            </button>
            <button className="primary">Salvar</button>
          </div>
        </form>
      </ModalShell>
    )
  }
  const isMessage = ["Confirmação", "Remarcação", "Cobrança"].includes(setting)
  const current =
    key === "doctors"
      ? clinic.doctors.join("\n")
      : key
        ? String(clinic[key])
        : ""
  return (
    <ModalShell close={close}>
      <h2>Editar {setting.toLowerCase()}</h2>
      {isMessage && (
        <p className="modal-subtitle">
          Variáveis disponíveis: {"{paciente}, {data}, {hora}"}
          {setting === "Cobrança" ? ", {valor}" : ""}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const value = String(new FormData(event.currentTarget).get("value"))
          if (key === "doctors" && !value.trim())
            return notify("Cadastre pelo menos um profissional")
          updateClinic({
            [key]:
              key === "doctors" ? value.split("\n").filter(Boolean) : value,
          })
          close()
          notify(`${setting} atualizado`)
        }}
      >
        <label className="modal-field">
          {setting}
          {["Equipe", "Profissionais"].includes(setting) || isMessage ? (
            <textarea
              name="value"
              rows={isMessage ? 6 : 5}
              defaultValue={current}
              required
            />
          ) : (
            <input name="value" defaultValue={current} required />
          )}
        </label>
        <div className="simple-modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Cancelar
          </button>
          <button className="primary">Salvar</button>
        </div>
      </form>
    </ModalShell>
  )
}

const STORAGE_KEY = "minha-agenda-mvp-v1"

function loadAppData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)

    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

function saveAppData(data: object) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    return true
  } catch (error) {
    console.error("Erro ao salvar os dados:", error)
    return false
  }
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}

const defaultClinic: ClinicData = {
  name: "Minha clínica",
  email: "",
  whatsapp: "",
  phone: "",
  address: "",
  team: "",
  doctors: ["Profissional 1"],
  confirmation:
    "Olá {paciente}! Sua consulta está marcada para {data} às {hora}. Pode confirmar?",
  reschedule:
    "Olá {paciente}! Precisamos remarcar sua consulta. Podemos agendar para {data} às {hora}?",
  charge:
    "Olá {paciente}! Identificamos um pagamento em aberto de {valor}. Podemos ajudar?",
  replies: [
    {
      title: "Dor depois do canal",
      text: "Um leve desconforto nos primeiros dias é comum. Evite mastigar do lado tratado e tome apenas o que o profissional indicou. Se a dor aumentar, houver inchaço ou febre, nos avise hoje.",
    },
    {
      title: "Sensibilidade após clareamento",
      text: "A sensibilidade costuma passar em até 48 horas. Evite alimentos muito gelados, quentes ou pigmentados (café, vinho) nesse período.",
    },
    {
      title: "Cuidados depois do implante",
      text: "Nos primeiros dias, prefira alimentos frios e macios, não cuspa com força e mantenha a higiene como orientado. Em caso de sangramento intenso, ligue para a clínica.",
    },
    {
      title: "Formas de pagamento",
      text: "Aceitamos PIX, cartão em até 6× e dinheiro. Também podemos parcelar o saldo do tratamento.",
    },
    {
      title: "Recibo para imposto de renda",
      text: "Enviamos o recibo pelo WhatsApp em até 2 dias úteis. Pode nos passar o nome e o CPF que devem constar?",
    },
  ],
}

function mergeClinic(saved: Partial<ClinicData> | undefined): ClinicData {
  const merged = { ...defaultClinic, ...(saved ?? {}) }
  if (!Array.isArray(merged.doctors) || merged.doctors.length === 0)
    merged.doctors = defaultClinic.doctors
  if (!Array.isArray(merged.replies)) merged.replies = defaultClinic.replies
  return merged
}

export default function App() {
  const [savedData] = useState(loadAppData)

  const [page, setPage] = useState<Page>("Home")

  const [appointments, setAppointments] = useState<Appointment[]>(() =>
    Array.isArray(savedData?.appointments)
      ? savedData.appointments.map((item: Appointment) => ({
          ...item,
          fresh: false,
        }))
      : initialAppointments,
  )
  const [activity, setActivity] = useState<Activity[]>(() =>
    Array.isArray(savedData?.activity) ? savedData.activity : [],
  )

  const [formOpen, setFormOpen] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [direction, setDirection] = useState<"next" | "prev">("next")

  const [charged, setCharged] = useState<string[]>(
    () => savedData?.charged ?? [],
  )

  const [schedule, setSchedule] = useState<typeof scheduleInitial>(
    () => savedData?.schedule ?? scheduleInitial,
  )

  const [toast, setToast] = useState("")
  const [editing, setEditing] = useState<EditingAppointment>(null)
  const [settingModal, setSettingModal] = useState("")

  const [brandColor, setBrandColor] = useState(
    () => savedData?.brandColor ?? "#713C4E",
  )

  const [dark, setDark] = useState<boolean>(
    () => savedData?.dark ?? false,
  )

  const [logoUrl, setLogoUrl] = useState<string>(
    () => savedData?.logoUrl ?? "",
  )
  const [dialog, setDialog] = useState<Dialog>(null)
  const [clinic, setClinic] = useState<ClinicData>(() =>
    mergeClinic(savedData?.clinic),
  )

  const notify = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(""), 2100)
  }
  useEffect(() => {
    const ok = saveAppData({
      appointments,
      charged,
      schedule,
      brandColor,
      dark,
      clinic,
      logoUrl,
      activity,
    })
    if (!ok) notify("Não foi possível salvar neste navegador. Baixe um backup.")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, charged, schedule, brandColor, dark, clinic, logoUrl, activity])

  const logActivity = (kind: ActivityKind, patient: string) =>
    setActivity((items) => [
      ...items,
      { id: Date.now() + items.length, kind, patient, at: new Date().toISOString() },
    ])
  const navigate = (next: Page) => {
    setPage(next)
    if (next !== "Agenda") setFormOpen(false)
  }
  const sendConfirmation = (item: Appointment) => {
    const opened = openWhatsApp(
      item.phone,
      fill(clinic.confirmation, {
        paciente: item.patient,
        data: dateLabel(item.date),
        hora: item.time,
      }),
    )
    if (!opened) return notify(NO_PHONE_MESSAGE)
    logActivity("confirmação", item.patient)
    updateStatus(item.id, "Aguardando resposta")
    notify("Confirmação aberta no WhatsApp")
  }
  const respond = (id: number, status: Status) => {
    updateStatus(id, status)
    setDialog(null)
    notify(`Resposta salva: ${status}`)
  }
  const remind = (item: Appointment) => {
    const opened = openWhatsApp(
      item.phone,
      "Lembrete: " +
        fill(clinic.confirmation, {
          paciente: item.patient,
          data: dateLabel(item.date),
          hora: item.time,
        }),
    )
    if (!opened) return notify(NO_PHONE_MESSAGE)
    logActivity("lembrete", item.patient)
    notify("Lembrete aberto no WhatsApp")
  }
  const registerPayment = (id: number, amount: number, installments: number) => {
    setAppointments((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              paid: Math.min((item.paid ?? 0) + amount, item.price ?? 0),
              installments,
            }
          : item,
      ),
    )
    setDialog(null)
    notify("Pagamento registrado")
  }
  const exportCsv = () => {
    const currentMonth = getLocalDateString(new Date()).slice(0, 7)

    const rows = appointments
      .filter((item) => item.date.startsWith(currentMonth))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      .map((item) =>
        [
          item.date.split("-").reverse().join("/"),
          item.time,
          item.patient,
          item.doctor ?? "",
          item.procedure,
          item.status,
          (item.price ?? 0).toFixed(2).replace(".", ","),
          (item.paid ?? 0).toFixed(2).replace(".", ","),
          Math.max((item.price ?? 0) - (item.paid ?? 0), 0)
            .toFixed(2)
            .replace(".", ","),
          paymentLabel(item),
        ].join(";"),
      )
    const header =
      "Data;Hora;Paciente;Profissional;Procedimento;Status;Valor;Pago;Pendente;Pagamento"
    const blob = new Blob(["\ufeff" + [header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `resumo-${currentMonth}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
    notify("Planilha exportada")
  }
  const updateStatus = (id: number, status: Status) => {
    setAppointments((items) =>
      items.map((item) => (item.id === id ? { ...item, status } : item)),
    )
  }
  const newAppointment = () => {
    setPage("Agenda")
    setWeekOffset(0)
    setFormOpen(true)
  }
  const addAppointment = (appointment: Omit<Appointment, "id" | "status">) => {
    
    const availableNow = freeTimes(
      appointment.date,
      appointment.doctor ?? "",
      appointments,
      schedule,
    )

    if (!availableNow.includes(appointment.time)) {
      notify("Horário indisponível. Escolha outro horário.")
      return
    }

    const newItem: Appointment = {
      ...appointment,
      id: Date.now(),
      status: "A confirmar",
      fresh: true,
    }
    setAppointments((items) => [
      ...items.map((item) => ({ ...item, fresh: false })),
      newItem,
    ])
    setFormOpen(false)
    notify("Consulta salva")
  }
  const changeWeek = (step: number) => {
    setDirection(step > 0 ? "next" : "prev")
    setWeekOffset((value) => value + step)
  }
  const charge = (item: Appointment) => {
    const opened = openWhatsApp(
      item.phone,
      fill(clinic.charge, {
        paciente: item.patient,
        valor: money(owedOf(item)),
        data: dateLabel(item.date),
        hora: item.time,
      }),
    )
    if (!opened) return notify(NO_PHONE_MESSAGE)
    logActivity("cobrança", item.patient)
    setCharged((items) =>
      items.includes(item.patient) ? items : [...items, item.patient],
    )
    notify(`Cobrança aberta no WhatsApp: ${item.patient}`)
  }
  const saveAppointment = (appointment: Appointment) => {
    setAppointments((items) =>
      items.map((item) => (item.id === appointment.id ? appointment : item)),
    )
    setEditing(null)
    notify("Consulta atualizada")
  }
  const unbookAppointment = (id: number) => {
    updateStatus(id, "Desmarcou")
    setEditing(null)
    notify("Consulta desmarcada")
  }
  const addDebt = (data: {
    patient: string
    phone: string
    amount: number
    date: string
    procedure: string
  }) => {
    setAppointments((items) => [
      ...items,
      {
        id: Date.now(),
        patient: data.patient,
        phone: data.phone,
        date: data.date,
        time: "08:00",
        procedure: data.procedure,
        status: "Confirmado",
        doctor: clinic.doctors[0],
        price: data.amount,
        paid: 0,
        debtOnly: true,
      },
    ])
    setDialog(null)
    notify("Dívida cadastrada")
  }
  const exportBackup = () => {
    downloadFile(
      `backup-agenda-${TODAY}.json`,
      JSON.stringify(
        {
          version: 1,
          appointments,
          charged,
          schedule,
          brandColor,
          dark,
          clinic,
          logoUrl,
          activity,
        },
        null,
        2,
      ),
      "application/json",
    )
    notify("Backup baixado")
  }
  const importBackup = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!Array.isArray(data.appointments)) throw new Error("formato")
        if (
          !window.confirm(
            "Restaurar este backup vai substituir os dados atuais. Continuar?",
          )
        )
          return
        setAppointments(
          data.appointments.map((item: Appointment) => ({
            ...item,
            fresh: false,
          })),
        )
        setCharged(Array.isArray(data.charged) ? data.charged : [])
        if (Array.isArray(data.schedule) && data.schedule.length === 7)
          setSchedule(data.schedule)
        if (typeof data.brandColor === "string") setBrandColor(data.brandColor)
        setDark(Boolean(data.dark))
        setClinic(mergeClinic(data.clinic))
        setLogoUrl(typeof data.logoUrl === "string" ? data.logoUrl : "")
        setActivity(Array.isArray(data.activity) ? data.activity : [])
        notify("Backup restaurado")
      } catch {
        notify("Arquivo de backup inválido")
      }
    }
    reader.onerror = () => notify("Não foi possível ler o arquivo")
    reader.readAsText(file)
  }
  const exportActivity = () => {
    const rows = activity.map((item) =>
      [
        new Date(item.at).toLocaleString("pt-BR"),
        item.kind,
        item.patient.replaceAll(";", ","),
      ].join(";"),
    )
    downloadFile(
      `registro-de-uso-${TODAY}.csv`,
      "\ufeff" + ["Data e hora;Tipo;Paciente", ...rows].join("\n"),
      "text/csv;charset=utf-8",
    )
    notify("Registro baixado")
  }
  const uploadLogo = (file: File) => {
    if (!file.type.startsWith("image/")) {
      notify("Selecione um arquivo de imagem.")
      return
    }

    if (file.size > 500 * 1024) {
      notify("A logo deve ter no máximo 500 KB.")
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      setLogoUrl(String(reader.result))
      notify("Logo atualizada")
    }

    reader.onerror = () => {
      notify("Não foi possível carregar a imagem.")
    }

    reader.readAsDataURL(file)
  }
  const pageContent = (() => {
    if (page === "Home")
      return (
        <Home
          appointments={appointments}
          newAppointment={newAppointment}
          editAppointment={(appointment, mode = "edit") =>
            setEditing({ appointment, mode })
          }
          sendConfirmation={sendConfirmation}
          openResponse={(item) => setDialog({ type: "response", id: item.id })}
          markPaid={(item) => registerPayment(item.id, item.price ?? 0, 1)}
          openQueue={() =>
            setDialog({
              type: "queue",
              ids: appointments
                .filter(
                  (item) => item.date === TODAY && item.status === "A confirmar",
                )
                .map((item) => item.id),
            })
          }
        />
      )
    if (page === "Agenda")
      return (
        <Agenda
          appointments={appointments}
          weekOffset={weekOffset}
          direction={direction}
          changeWeek={changeWeek}
          resetWeek={() => {
            setDirection("prev")
            setWeekOffset(0)
          }}
          formOpen={formOpen}
          setFormOpen={setFormOpen}
          addAppointment={addAppointment}
          openDetails={(appointment) =>
            setEditing({ appointment, mode: "edit" })
          }
          doctors={clinic.doctors}
          schedule={schedule}
        />
      )
    if (page === "Financeiro")
      return (
        <Financeiro
          appointments={appointments}
          addDebt={() => setDialog({ type: "debt" })}
          charged={charged}
          charge={charge}
          openPay={(item) => setDialog({ type: "pay", id: item.id })}
          payFull={(item) => registerPayment(item.id, owedOf(item), 1)}
          exportCsv={exportCsv}
        />
      )
    return (
      <Settings
        schedule={schedule}
        toggleDay={(index) =>
          setSchedule((items) =>
            items.map((item, itemIndex) =>
              itemIndex === index ? { ...item, enabled: !item.enabled } : item,
            ),
          )
        }
        brandColor={brandColor}
        setBrandColor={setBrandColor}
        dark={dark}
        toggleTheme={() => setDark((value) => !value)}
        clinic={clinic}
        openSetting={setSettingModal}
        uploadLogo={uploadLogo}
        activity={activity}
        exportBackup={exportBackup}
        importBackup={importBackup}
        exportActivity={exportActivity}
      />
    )
  })()

  return (
    <div
      className={`app ${dark ? "dark" : ""}`}
      style={{ "--brand": brandColor } as React.CSSProperties}
    >
      <Sidebar
        page={page}
        onChange={navigate}
        logoUrl={logoUrl}
        name={clinic.name}
      />
      <main className="main">
        <div className="page-transition" key={page}>
          {pageContent}
        </div>
      </main>
      {editing && (
        <AppointmentModal
          editing={editing}
          doctors={clinic.doctors}
          appointments={appointments}
          schedule={schedule}
          clinic={clinic}
          close={() => setEditing(null)}
          save={saveAppointment}
          unbook={unbookAppointment}
          notify={notify}
          logActivity={logActivity}
        />
      )}
      {dialog?.type === "debt" && (
        <DebtModal
          close={() => setDialog(null)}
          save={addDebt}
          latestDate={formatDate(addDays(new Date(`${TODAY}T12:00:00`), -1))}
        />
      )}
      {dialog?.type === "pay" &&
        appointments.find((item) => item.id === dialog.id) && (
          <PaymentModal
            item={appointments.find((item) => item.id === dialog.id)!}
            close={() => setDialog(null)}
            save={(amount, installments) =>
              registerPayment(dialog.id, amount, installments)
            }
          />
        )}
      {dialog?.type === "response" &&
        appointments.find((item) => item.id === dialog.id) && (
          <ResponseModal
            item={appointments.find((item) => item.id === dialog.id)!}
            close={() => setDialog(null)}
            respond={(status) => respond(dialog.id, status)}
            remind={() =>
              remind(appointments.find((item) => item.id === dialog.id)!)
            }
          />
        )}
      {dialog?.type === "queue" && (
        <QueueModal
          items={appointments.filter((item) => dialog.ids.includes(item.id))}
          close={() => setDialog(null)}
          send={sendConfirmation}
        />
      )}
      {settingModal && (
        <SettingModal
          setting={settingModal}
          clinic={clinic}
          schedule={schedule}
          close={() => setSettingModal("")}
          updateClinic={(data) =>
            setClinic((current) => ({ ...current, ...data }))
          }
          updateHours={(index, hours) =>
            setSchedule((items) =>
              items.map((item, itemIndex) =>
                itemIndex === index ? { ...item, hours } : item,
              ),
            )
          }
          notify={notify}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}