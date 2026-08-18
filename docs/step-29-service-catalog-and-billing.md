# Step 29: Service Catalog and Local-First Billing

## Implementation summary

Step 29 adds the first operational finance vertical slice for Elite Clinic. The existing clinical service catalog remains the source of active service definitions and Egyptian Pound prices. The new billing ledger captures immutable line-item price snapshots so later service-price changes cannot rewrite historical invoices.

The workflow supports Admin-managed service packages, invoice creation, discounts with mandatory reasons, partial payments, payment-method records, receipts, refunds, and invoice reconciliation. Insurance remains out of scope as previously decided.

## Database migration 19

Migration 19 adds the following tables:

| Table                      | Purpose                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `billing_packages`         | Admin-managed prepaid service bundles with EGP price, optional validity, lifecycle status, and version metadata. |
| `billing_package_items`    | Services and quantities included in each package.                                                                |
| `billing_invoices`         | Patient invoices with appointment linkage, EGP totals, discount reason, lifecycle status, and version metadata.  |
| `billing_invoice_lines`    | Historical service/package references and unit-price snapshots.                                                  |
| `billing_payments`         | Posted, voided, or refunded payments with method and optional reference.                                         |
| `billing_refunds`          | Partial or full refunds with mandatory reasons and actor metadata.                                               |
| `billing_receipts`         | Receipt numbers tied to individual payments. Full refunds void the associated receipt.                           |
| `billing_number_sequences` | Transactional invoice and receipt number allocation.                                                             |

Invoice numbers use `EL-INV-000001` format and receipt numbers use `EL-REC-000001` format. All monetary values are nonnegative integer Egyptian Pound amounts; fractional currency values are not accepted by the domain contracts.

## Business invariants

An invoice line references exactly one active service or active package. Service and package prices are copied into the invoice line at creation. A discount cannot exceed the subtotal and requires a reason. A payment cannot exceed the current invoice balance. A refund cannot exceed the remaining refundable amount for its payment. Reconciliation computes net paid amount as posted payments less posted refunds and transitions the invoice between `open`, `partially-paid`, `paid`, and `refunded` states.

Payment and refund mutations execute inside database transactions. Invoice and receipt sequence values are allocated within the same transaction as their record. Audit events record package creation and archival, invoice creation, payment posting, and refund posting without storing unnecessary clinical payloads.

## Permissions

| Operation                             | Required capability                                |
| ------------------------------------- | -------------------------------------------------- |
| Read services, packages, and invoices | `billing.read`                                     |
| Create invoices and post payments     | `billing.write`                                    |
| Record refunds                        | `billing.refund`                                   |
| Create or archive service packages    | `module.manage`, currently assigned to Admin users |

The desktop UI renders catalog-management controls only for users with `module.manage`, while billing operations remain capability-gated in the main-process service boundary.

## Desktop workflow

The authenticated Electron workspace now includes a billing section. Users with billing-read access can review active services, packages, and invoices. Billing writers can create an invoice for an `EL-00001`-style patient ID, choose a service or package, apply a reasoned discount, post full or partial payments, choose a payment method, and receive the generated receipt number. Users with refund permission can record a partial or full refund with a mandatory reason.

The renderer communicates only through the typed preload bridge. It does not access SQLite directly, and sensitive authorization decisions remain in the main process.

## Verification

The Step 29 synthetic tests cover package-permission boundaries, invoice creation, price snapshots, discount handling, partial payments, receipt numbering, payment-over-balance rejection, refunds, receipt voiding, and invoice reconciliation. The database foundation test verifies migration 19 and the billing tables.

The available workspace gate passed: all TypeScript tests, TypeScript typechecking, desktop production build, formatting, and whitespace checks.

## Remaining Step 29 gate

Android billing UI and a dedicated `billing-summary` synchronization scope are not yet enabled. This is intentional: the Android build and physical-device gates from Steps 27–28 remain workstation-dependent, and adding a new synchronized scope requires coordinated updates to the cross-platform scope contracts, desktop sync cursors and resource-version constraints, Android scope parsing, Android local projections, and conflict/outbox behavior. The next billing increment should add that coordinated cross-platform scope before exposing financial records on Android.

Before production use, the clinic must confirm the authority thresholds for discounts and refunds, whether packages are prepaid or visit-based, package expiration behavior, and the approved payment-method policy. The current implementation records these actions and requires reasons but does not yet add a configurable monetary approval threshold.

## References

[1]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/9139caf/packages/contracts/src/index.ts "Elite Clinic contracts and synchronization model"
[2]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/9139caf/packages/database/src/index.ts "Elite Clinic database migrations"
[3]: https://github.com/mohamedarafa1991-stack/elite-clinic-management-system/blob/9139caf/packages/auth/src/billing-service.ts "Elite Clinic billing service"
