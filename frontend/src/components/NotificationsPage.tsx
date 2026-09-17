/** No notification dispatch or history endpoint is connected to this page. */
export const NotificationsPage = () => (
  <div className="workspace-page min-w-0 space-y-8">
    <header className="space-y-2 border-b border-slate-200 pb-5">
      <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-slate-900">Reminders & Notifications</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
        Messaging availability and where to manage member follow-ups.
      </p>
    </header>

    <section aria-labelledby="notifications-availability" className="rounded-xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-200 p-4 sm:p-6">
        <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
          Not connected
        </span>
        <h3 id="notifications-availability" className="text-lg font-semibold text-slate-900">
          Sending and history are unavailable here
        </h3>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
          This page is not connected to a notification service. It cannot send or schedule messages,
          and no delivery history is available. This does not mean that no messages have been sent elsewhere.
        </p>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        <div className="grid gap-2 p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6 sm:p-6">
          <dt className="font-semibold text-slate-900">Member conversations</dt>
          <dd className="max-w-xl leading-relaxed text-slate-600">
            Use WhatsApp from the navigation, if available for your role, to contact assigned members
            and review conversation history.
          </dd>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6 sm:p-6">
          <dt className="font-semibold text-slate-900">Agent reminders</dt>
          <dd className="max-w-xl leading-relaxed text-slate-600">
            Request a reminder in the assistant. Review the recipients and message in the confirmation
            request before authorizing a send. Availability depends on your permissions and the messaging connection.
          </dd>
        </div>
      </dl>
    </section>
  </div>
);

