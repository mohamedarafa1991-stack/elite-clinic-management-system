import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type { SessionSummary } from "../preload/index.js";
import type {
  BillingDoctorCompensationRule,
  DoctorDirectoryEntry,
  DoctorEarningsAnalytics,
  Service,
} from "@elite/contracts";

function formatEgp(amount: number, locale: "en-EG" | "ar-EG"): string {
  return `${amount.toLocaleString(locale)} EGP`;
}

function toIsoDate(date: string): string {
  return `${date}T00:00:00.000Z`;
}

export function DoctorEarningsPanel({
  token,
  session,
  locale,
}: {
  token: string;
  session: SessionSummary;
  locale: "en-EG" | "ar-EG";
}): ReactElement | null {
  const canReadEarnings = session.capabilities.includes(
    "billing.earnings.read",
  );
  const canManageCompensation = session.capabilities.includes(
    "billing.compensation.manage",
  );
  const [doctors, setDoctors] = useState<readonly DoctorDirectoryEntry[]>([]);
  const [services, setServices] = useState<readonly Service[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState(
    session.role === "doctor" ? session.userId : "",
  );
  const [earnings, setEarnings] = useState<DoctorEarningsAnalytics | null>(
    null,
  );
  const [rules, setRules] = useState<readonly BillingDoctorCompensationRule[]>(
    [],
  );
  const [serviceId, setServiceId] = useState("");
  const [feeEgp, setFeeEgp] = useState("");
  const [compensationType, setCompensationType] = useState<
    "percentage" | "fixed"
  >("percentage");
  const [sharePercent, setSharePercent] = useState("60");
  const [shareAmountEgp, setShareAmountEgp] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const labels =
    locale === "ar-EG"
      ? {
          title: "أرباح الأطباء وتعويضاتهم",
          detail:
            "تُحسب الأرباح من المدفوعات المحصلة فقط، وتؤثر المرتجعات على الأرباح.",
          doctor: "الطبيب",
          service: "الخدمة",
          fee: "رسوم الطبيب (جنيه)",
          type: "نوع الحصة",
          percentage: "نسبة مئوية",
          fixed: "مبلغ ثابت",
          sharePercent: "النسبة (%)",
          shareAmount: "المبلغ الثابت (جنيه)",
          effectiveFrom: "سارية من",
          save: "حفظ قاعدة التعويض",
          monthly: "الأرباح الشهرية",
          collected: "المحصل",
          refunded: "المرتجع",
          earnings: "أرباح الطبيب",
          retained: "المتبقي للعيادة",
          invoices: "الفواتير",
          rules: "قواعد التعويض الحالية",
          noRules: "لا توجد قواعد تعويض بعد.",
          loading: "جارٍ تحميل بيانات الأرباح…",
          unavailable: "بيانات الأرباح غير متاحة.",
        }
      : {
          title: "Doctor earnings and compensation",
          detail:
            "Earnings are recognized from collected payments only; refunds reduce earnings.",
          doctor: "Doctor",
          service: "Service",
          fee: "Doctor fee (EGP)",
          type: "Share type",
          percentage: "Percentage",
          fixed: "Fixed amount",
          sharePercent: "Share (%)",
          shareAmount: "Fixed share (EGP)",
          effectiveFrom: "Effective from",
          save: "Save compensation rule",
          monthly: "Monthly earnings",
          collected: "Collected",
          refunded: "Refunded",
          earnings: "Doctor earnings",
          retained: "Clinic retained",
          invoices: "Invoices",
          rules: "Current compensation rules",
          noRules: "No compensation rules configured yet.",
          loading: "Loading earnings…",
          unavailable: "Earnings data is unavailable.",
        };

  useEffect(() => {
    if (!canManageCompensation) return;
    void Promise.all([
      window.elite.clinical.listDoctors(token),
      window.elite.clinical.listServices(token),
    ])
      .then(([doctorRows, serviceRows]) => {
        setDoctors(doctorRows);
        setServices(
          serviceRows.filter((service) => service.status === "active"),
        );
        if (!selectedDoctorId && doctorRows[0]) {
          setSelectedDoctorId(doctorRows[0].id);
        }
        if (!serviceId && serviceRows[0]) {
          setServiceId(serviceRows[0].id);
        }
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : labels.unavailable);
      });
  }, [token, canManageCompensation]);

  useEffect(() => {
    if (!canReadEarnings || (session.role === "admin" && !selectedDoctorId)) {
      return;
    }
    setError(null);
    const targetDoctorId =
      session.role === "doctor" ? undefined : selectedDoctorId;
    void Promise.all([
      window.elite.billing.getDoctorEarnings(token, targetDoctorId),
      canManageCompensation
        ? window.elite.billing.listCompensationRules(token, selectedDoctorId)
        : Promise.resolve([] as readonly BillingDoctorCompensationRule[]),
    ])
      .then(([nextEarnings, nextRules]) => {
        setEarnings(nextEarnings);
        setRules(nextRules);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : labels.unavailable);
      });
  }, [
    token,
    selectedDoctorId,
    canReadEarnings,
    canManageCompensation,
    session.role,
  ]);

  if (!canReadEarnings) return null;

  const saveRule = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedDoctorId || !serviceId) return;
    setIsBusy(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.billing.createCompensationRule(token, {
        doctorId: selectedDoctorId,
        serviceId,
        feeEgp: Number(feeEgp),
        compensationType,
        ...(compensationType === "percentage"
          ? { shareBps: Math.round(Number(sharePercent) * 100) }
          : { shareAmountEgp: Number(shareAmountEgp) }),
        effectiveFrom: toIsoDate(effectiveFrom),
      });
      setNotice(
        locale === "ar-EG"
          ? "تم حفظ قاعدة التعويض."
          : "Compensation rule saved.",
      );
      setFeeEgp("");
      setShareAmountEgp("");
      const [nextRules, nextEarnings] = await Promise.all([
        window.elite.billing.listCompensationRules(token, selectedDoctorId),
        window.elite.billing.getDoctorEarnings(token, selectedDoctorId),
      ]);
      setRules(nextRules);
      setEarnings(nextEarnings);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : labels.unavailable);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="form-section doctor-earnings-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{labels.title}</p>
          <h3>{earnings?.doctorNameEn ?? labels.loading}</h3>
        </div>
        {earnings ? (
          <span className="status ok">
            {earnings.fromMonth} → {earnings.toMonth}
          </span>
        ) : null}
      </div>
      <p className="form-help">{labels.detail}</p>
      {error ? <p className="status danger">{error}</p> : null}
      {notice ? <p className="status ok">{notice}</p> : null}

      {canManageCompensation ? (
        <form
          className="compensation-rule-form"
          onSubmit={(event) => void saveRule(event)}
        >
          <h4>{labels.rules}</h4>
          <div className="form-grid">
            <label>
              {labels.doctor}
              <select
                required
                value={selectedDoctorId}
                onChange={(event) => setSelectedDoctorId(event.target.value)}
              >
                <option value="">{labels.doctor}</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.displayNameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {labels.service}
              <select
                required
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
              >
                <option value="">{labels.service}</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {labels.fee}
              <input
                required
                min="0"
                type="number"
                value={feeEgp}
                onChange={(event) => setFeeEgp(event.target.value)}
              />
            </label>
            <label>
              {labels.type}
              <select
                value={compensationType}
                onChange={(event) =>
                  setCompensationType(
                    event.target.value as "percentage" | "fixed",
                  )
                }
              >
                <option value="percentage">{labels.percentage}</option>
                <option value="fixed">{labels.fixed}</option>
              </select>
            </label>
            {compensationType === "percentage" ? (
              <label>
                {labels.sharePercent}
                <input
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  type="number"
                  value={sharePercent}
                  onChange={(event) => setSharePercent(event.target.value)}
                />
              </label>
            ) : (
              <label>
                {labels.shareAmount}
                <input
                  required
                  min="0"
                  type="number"
                  value={shareAmountEgp}
                  onChange={(event) => setShareAmountEgp(event.target.value)}
                />
              </label>
            )}
            <label>
              {labels.effectiveFrom}
              <input
                required
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </label>
          </div>
          <button className="button secondary" type="submit" disabled={isBusy}>
            {labels.save}
          </button>
        </form>
      ) : null}

      {earnings ? (
        <>
          <div className="earnings-metrics-grid">
            {[
              [
                labels.collected,
                earnings.monthly.reduce(
                  (sum, point) => sum + point.collectedEgp,
                  0,
                ),
              ],
              [
                labels.refunded,
                earnings.monthly.reduce(
                  (sum, point) => sum + point.refundedEgp,
                  0,
                ),
              ],
              [
                labels.earnings,
                earnings.monthly.reduce(
                  (sum, point) => sum + point.earningsEgp,
                  0,
                ),
              ],
              [
                labels.retained,
                earnings.monthly.reduce(
                  (sum, point) => sum + point.clinicRetainedEgp,
                  0,
                ),
              ],
            ].map(([label, value]) => (
              <div className="earnings-metric" key={String(label)}>
                <span>{label}</span>
                <strong>{formatEgp(Number(value), locale)}</strong>
              </div>
            ))}
          </div>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>{locale === "ar-EG" ? "الشهر" : "Month"}</th>
                  <th>{labels.collected}</th>
                  <th>{labels.refunded}</th>
                  <th>{labels.earnings}</th>
                  <th>{labels.retained}</th>
                  <th>{labels.invoices}</th>
                </tr>
              </thead>
              <tbody>
                {earnings.monthly.map((point) => (
                  <tr key={point.month}>
                    <td dir="ltr">{point.month}</td>
                    <td>{formatEgp(point.collectedEgp, locale)}</td>
                    <td>{formatEgp(point.refundedEgp, locale)}</td>
                    <td>{formatEgp(point.earningsEgp, locale)}</td>
                    <td>{formatEgp(point.clinicRetainedEgp, locale)}</td>
                    <td>{point.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManageCompensation ? (
            <div className="compensation-rule-list">
              {rules.length === 0 ? (
                <p className="muted">{labels.noRules}</p>
              ) : null}
              {rules.map((rule) => (
                <div className="patient-row" key={rule.id}>
                  <span>
                    <strong>{rule.serviceNameEn}</strong>
                    <small>
                      {formatEgp(rule.feeEgp, locale)} ·{" "}
                      {rule.compensationType === "percentage"
                        ? `${(rule.shareBps ?? 0) / 100}%`
                        : formatEgp(rule.shareAmountEgp ?? 0, locale)}
                    </small>
                  </span>
                  <span className="status ok" dir="ltr">
                    {rule.effectiveFrom.slice(0, 10)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="muted">{labels.loading}</p>
      )}
    </section>
  );
}
