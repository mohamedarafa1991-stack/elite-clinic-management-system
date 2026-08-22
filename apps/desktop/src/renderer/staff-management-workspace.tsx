import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import type {
  StaffAccountCreateInput,
  StaffAccountSummary,
  StaffAccountUpdateInput,
  StaffPasswordResetInput,
} from "@elite/auth";
import type { UserRole } from "@elite/contracts";
import type { WorkspaceLocale } from "./workspace-model.js";

export interface StaffManagementWorkspaceProps {
  token: string;
  currentUserId: string;
  locale: WorkspaceLocale;
}

const initialForm: StaffAccountCreateInput = {
  username: "",
  password: "",
  displayNameEn: "",
  displayNameAr: "",
  role: "receptionist",
  isClinicalApprover: false,
};

const roleOptions: readonly UserRole[] = [
  "receptionist",
  "doctor",
  "nurse",
  "admin",
];

function roleLabel(role: UserRole, locale: WorkspaceLocale): string {
  if (locale === "ar-EG") {
    return {
      admin: "مدير",
      doctor: "طبيب",
      nurse: "تمريض",
      receptionist: "استقبال",
    }[role];
  }
  return {
    admin: "Admin",
    doctor: "Doctor",
    nurse: "Nurse",
    receptionist: "Receptionist",
  }[role];
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

export function StaffManagementWorkspace({
  token,
  currentUserId,
  locale,
}: StaffManagementWorkspaceProps): ReactElement {
  const isArabic = locale === "ar-EG";
  const [accounts, setAccounts] = useState<readonly StaffAccountSummary[]>([]);
  const [form, setForm] = useState<StaffAccountCreateInput>(initialForm);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const labels = {
    eyebrow: isArabic ? "إدارة الوصول" : "Access governance",
    title: isArabic ? "الموظفون والصلاحيات" : "Staff & access",
    detail: isArabic
      ? "أنشئ حسابات آمنة وحدد دور كل شخص قبل بدء التشغيل."
      : "Create secure accounts and assign each person the minimum role they need.",
    refresh: isArabic ? "تحديث" : "Refresh",
    createTitle: isArabic ? "إضافة حساب موظف" : "Add staff account",
    createDetail: isArabic
      ? "استخدم كلمة مرور مؤقتة قوية وشاركها بطريقة آمنة."
      : "Use a strong temporary password and share it securely.",
    username: isArabic ? "اسم المستخدم" : "Username",
    displayNameEn: isArabic ? "الاسم بالإنجليزية" : "Display name",
    displayNameAr: isArabic ? "الاسم بالعربية" : "Arabic display name",
    password: isArabic ? "كلمة المرور المؤقتة" : "Temporary password",
    role: isArabic ? "الدور" : "Role",
    clinicalApprover: isArabic
      ? "يمكنه اعتماد السجلات السريرية"
      : "Can approve clinical records",
    create: isArabic ? "إنشاء الحساب" : "Create account",
    accountsTitle: isArabic ? "الحسابات الحالية" : "Current accounts",
    active: isArabic ? "نشط" : "Active",
    inactive: isArabic ? "متوقف" : "Inactive",
    deactivate: isArabic ? "إيقاف الحساب" : "Deactivate",
    activate: isArabic ? "تفعيل الحساب" : "Activate",
    reset: isArabic ? "إعادة تعيين كلمة المرور" : "Reset password",
    savePassword: isArabic ? "حفظ كلمة المرور" : "Save password",
    cancel: isArabic ? "إلغاء" : "Cancel",
    permissions: isArabic ? "صلاحية" : "permissions",
    self: isArabic ? "حسابك الحالي" : "Your current account",
    loading: isArabic ? "جارٍ تحميل الحسابات…" : "Loading accounts…",
    empty: isArabic ? "لا توجد حسابات" : "No staff accounts found",
    created: isArabic ? "تم إنشاء الحساب" : "Staff account created",
    updated: isArabic ? "تم تحديث الحساب" : "Staff account updated",
    passwordUpdated: isArabic ? "تم تحديث كلمة المرور" : "Password updated",
    unable: isArabic ? "تعذر تحميل الحسابات" : "Unable to load staff accounts",
  };

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      setAccounts(await window.elite.auth.listStaff(token));
    } catch (reason: unknown) {
      setError(errorMessage(reason, labels.unable));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [token]);

  const submitCreate = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.auth.createStaff(token, {
        ...form,
        displayNameAr: form.displayNameAr?.trim() || undefined,
      });
      setForm(initialForm);
      setNotice(labels.created);
      await refresh();
    } catch (reason: unknown) {
      setError(errorMessage(reason, labels.unable));
    } finally {
      setIsSaving(false);
    }
  };

  const updateAccount = async (
    account: StaffAccountSummary,
    changes: Partial<StaffAccountUpdateInput>,
  ): Promise<void> => {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await window.elite.auth.updateStaff(token, {
        userId: account.id,
        displayNameEn: account.displayNameEn,
        displayNameAr: account.displayNameAr,
        role: account.role,
        isClinicalApprover: account.isClinicalApprover,
        isActive: account.isActive,
        ...changes,
      });
      setNotice(labels.updated);
      await refresh();
    } catch (reason: unknown) {
      setError(errorMessage(reason, labels.unable));
    } finally {
      setIsSaving(false);
    }
  };

  const submitReset = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!resetFor) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const input: StaffPasswordResetInput = {
        userId: resetFor,
        password: resetPassword,
      };
      await window.elite.auth.resetStaffPassword(token, input);
      setResetFor(null);
      setResetPassword("");
      setNotice(labels.passwordUpdated);
    } catch (reason: unknown) {
      setError(errorMessage(reason, labels.unable));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      className="card staff-management-workspace"
      aria-labelledby="staff-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">{labels.eyebrow}</p>
          <h2 id="staff-title">{labels.title}</h2>
          <p className="form-help">{labels.detail}</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading || isSaving}
        >
          {labels.refresh}
        </button>
      </div>
      {notice ? (
        <p className="status ok" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="staff-management-grid">
        <form
          className="staff-create-panel"
          onSubmit={(event) => void submitCreate(event)}
        >
          <div className="section-heading">
            <div>
              <h3>{labels.createTitle}</h3>
              <p className="form-help">{labels.createDetail}</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>{labels.username}</span>
              <input
                required
                value={form.username}
                onChange={(event) =>
                  setForm({ ...form, username: event.target.value })
                }
                autoComplete="off"
              />
            </label>
            <label>
              <span>{labels.displayNameEn}</span>
              <input
                required
                value={form.displayNameEn}
                onChange={(event) =>
                  setForm({ ...form, displayNameEn: event.target.value })
                }
              />
            </label>
            <label>
              <span>{labels.displayNameAr}</span>
              <input
                value={form.displayNameAr ?? ""}
                onChange={(event) =>
                  setForm({ ...form, displayNameAr: event.target.value })
                }
                dir="rtl"
              />
            </label>
            <label>
              <span>{labels.password}</span>
              <input
                required
                type="password"
                minLength={12}
                value={form.password}
                onChange={(event) =>
                  setForm({ ...form, password: event.target.value })
                }
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>{labels.role}</span>
              <select
                value={form.role}
                onChange={(event) =>
                  setForm({
                    ...form,
                    role: event.target.value as UserRole,
                    isClinicalApprover: false,
                  })
                }
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {roleLabel(role, locale)}
                  </option>
                ))}
              </select>
            </label>
            {form.role === "doctor" ? (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.isClinicalApprover}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      isClinicalApprover: event.target.checked,
                    })
                  }
                />
                <span>{labels.clinicalApprover}</span>
              </label>
            ) : null}
          </div>
          <button className="button primary" type="submit" disabled={isSaving}>
            {labels.create}
          </button>
        </form>
        <section
          className="staff-account-list"
          aria-labelledby="staff-list-title"
        >
          <div className="section-heading">
            <div>
              <h3 id="staff-list-title">{labels.accountsTitle}</h3>
            </div>
          </div>
          {isLoading ? (
            <p className="muted">{labels.loading}</p>
          ) : accounts.length === 0 ? (
            <p className="muted">{labels.empty}</p>
          ) : (
            <div className="staff-account-cards">
              {accounts.map((account) => {
                const isSelf = account.id === currentUserId;
                return (
                  <article
                    className={`staff-account-card${account.isActive ? "" : " is-inactive"}`}
                    key={account.id}
                  >
                    <div className="staff-account-card-heading">
                      <div>
                        <strong>{account.displayNameEn}</strong>
                        <span className="staff-account-username">
                          @{account.username}
                        </span>
                      </div>
                      <span
                        className={`status ${account.isActive ? "ok" : "warn"}`}
                      >
                        {account.isActive ? labels.active : labels.inactive}
                      </span>
                    </div>
                    <div className="staff-account-meta">
                      <label>
                        <span>{labels.role}</span>
                        <select
                          disabled={isSelf || isSaving}
                          value={account.role}
                          onChange={(event) =>
                            void updateAccount(account, {
                              role: event.target.value as UserRole,
                              isClinicalApprover:
                                event.target.value === "doctor" &&
                                account.isClinicalApprover,
                            })
                          }
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role, locale)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span>
                        {account.capabilities.length} {labels.permissions}
                      </span>
                      {account.isClinicalApprover ? (
                        <span className="status info">
                          {labels.clinicalApprover}
                        </span>
                      ) : null}
                    </div>
                    <div className="staff-account-actions">
                      {isSelf ? (
                        <span className="muted">{labels.self}</span>
                      ) : (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={isSaving}
                          onClick={() =>
                            void updateAccount(account, {
                              isActive: !account.isActive,
                            })
                          }
                        >
                          {account.isActive
                            ? labels.deactivate
                            : labels.activate}
                        </button>
                      )}
                      <button
                        className="button secondary"
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          setResetFor(account.id);
                          setResetPassword("");
                        }}
                      >
                        {labels.reset}
                      </button>
                    </div>
                    {resetFor === account.id ? (
                      <form
                        className="staff-reset-form"
                        onSubmit={(event) => void submitReset(event)}
                      >
                        <input
                          required
                          type="password"
                          minLength={12}
                          value={resetPassword}
                          onChange={(event) =>
                            setResetPassword(event.target.value)
                          }
                          placeholder={labels.password}
                          autoComplete="new-password"
                        />
                        <button
                          className="button primary"
                          type="submit"
                          disabled={isSaving}
                        >
                          {labels.savePassword}
                        </button>
                        <button
                          className="button ghost"
                          type="button"
                          onClick={() => setResetFor(null)}
                        >
                          {labels.cancel}
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
