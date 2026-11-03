import { useEffect, type ReactNode } from 'react';

const EFFECTIVE_DATE = '3 November 2026';
const PRIVACY_CONTACT = 'vparun.work@gmail.com';

function PolicyDocument({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `StudyDesk | ${title}`;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-subtle text-xs font-semibold tracking-wider uppercase">
          StudyDesk legal information
        </p>
        <h2 className="text-fg mt-1 text-2xl font-bold tracking-tight">{title}</h2>
        <p className="text-subtle mt-2 text-sm">Effective date: {EFFECTIVE_DATE}</p>
      </header>
      <div className="text-muted space-y-6 text-sm leading-relaxed">{children}</div>
      <p className="border-border bg-sunken text-subtle rounded-md border p-4 text-xs leading-relaxed">
        These documents are not legal advice. They should be reviewed by a qualified legal
        professional for the applicable jurisdictions.
      </p>
    </article>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={title.toLowerCase().replace(/ /g, '-')}>
      <h3
        id={title.toLowerCase().replace(/ /g, '-')}
        className="text-fg mb-2 text-base font-semibold"
      >
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function PrivacyPolicyPage() {
  return (
    <PolicyDocument title="Privacy Policy">
      <p>
        StudyDesk is a local-first study planner. This notice explains what the application stores
        in your browser and what is sent to third-party services when you choose to use optional
        sign-in and cloud sync.
      </p>

      <PolicySection title="Who operates StudyDesk">
        <p>
          StudyDesk is operated by Arun V P, an individual developer. StudyDesk is not presented as
          a registered company.
        </p>
        <p>
          StudyDesk is intended for users worldwide. Privacy and data-protection laws where you live
          or use the service may also apply. For privacy questions or requests, contact{' '}
          <a
            className="text-accent underline underline-offset-2"
            href={`mailto:${PRIVACY_CONTACT}`}
          >
            {PRIVACY_CONTACT}
          </a>
          . A request does not guarantee deletion where the application does not implement the
          relevant deletion capability.
        </p>
      </PolicySection>

      <PolicySection title="Local-first storage and profiles">
        <p>
          StudyDesk works without an account. Planner records and settings are stored in browser
          localStorage. Study Material attachment files are stored separately in IndexedDB. Browser
          storage is specific to the browser and site origin; it can be removed by browser data
          controls, device loss, or a change of browser or origin.
        </p>
        <p>
          A guest profile uses the browser&apos;s unscoped StudyDesk data. When authenticated, the
          app keeps a separate local profile for that Supabase user in the same browser. Signing out
          switches profiles; it does not delete either profile or remove data from the cloud.
          StudyDesk does not encrypt these local records itself, so protect access to your device
          and browser profile.
        </p>
      </PolicySection>

      <PolicySection title="Authentication and information sent to Supabase">
        <p>
          The current sign-in screen offers passwordless email sign-in links and Google OAuth
          through Supabase. Email sign-in sends your email address to Supabase Authentication, which
          may send an email according to the project&apos;s dashboard configuration. Google sign-in
          redirects you to Google for authentication and returns through Supabase.
        </p>
        <p>
          The client is configured to persist and refresh the Supabase session and to detect an
          authentication callback in the URL. Authentication account creation, email confirmation,
          email content and delivery, OAuth credentials, and allowed redirect URLs depend on
          provider and Supabase project settings that are not verifiable from this repository.
          StudyDesk does not implement email/password sign-in or a password-reset flow.
        </p>
      </PolicySection>

      <PolicySection title="Optional cloud synchronization">
        <p>
          If a deployment is configured for Supabase, you must choose an initial upload or restore
          in Settings before the device is initialized for sync. Once initialized, supported changes
          synchronize automatically when the service and network are available. The synchronized
          records include planner items, settings, timer data, and Study Materials metadata. This
          can include the content you enter into those records, such as task, note, calendar, or
          resource details, together with the account identifier and sync timestamps.
        </p>
        <p>
          The repository contains a Supabase migration that defines per-user row-level access
          policies for the sync table. Applying that migration and confirming the live
          project&apos;s configuration are deployment responsibilities; this notice cannot verify
          the dashboard or deployed database.
        </p>
      </PolicySection>

      <PolicySection title="Study Materials and attachments">
        <p>
          Study Material subjects, folders, file entries, and related metadata can synchronize.
          Attachment bytes do not: the current implementation stores those files only in that
          browser profile&apos;s IndexedDB. Cloud sync therefore does not transfer or preserve the
          actual files across devices.
        </p>
      </PolicySection>

      <PolicySection title="Guest-data transfer and backups">
        <p>
          Guest records are not uploaded automatically. Settings offers an explicit, confirmed merge
          into the signed-in profile; existing account records win ID conflicts and the guest copy
          remains unchanged. Imported records may sync if that account has cloud sync enabled.
        </p>
        <p>
          A complete ZIP backup is created in your browser and downloaded for you to store. It
          contains local records, Study Materials metadata, and attachment files. Its SHA-256
          digests help detect changes to archive contents; they are integrity checks, not
          encryption. Older JSON backups contain metadata only. Import replaces StudyDesk data in
          the active local profile, not the Supabase account. Keep backups private and store them
          securely.
        </p>
      </PolicySection>

      <PolicySection title="Deletion and retention">
        <p>
          The Settings &quot;Clear all data&quot; action is a local-data control for the active
          profile. It attempts to remove that profile&apos;s StudyDesk local records, sync
          bookkeeping, and IndexedDB material database. The IndexedDB deletion is not awaited or
          confirmed, and storage-removal failures are not reported in the interface, so complete
          removal is not guaranteed. This action does not sign you out or clear Supabase&apos;s
          persisted authentication session. Browser storage restrictions or a change of browser or
          origin can also leave other copies in place. Clearing browser site data is a separate
          browser-level action.
        </p>
        <p>
          There is no user-facing account deletion or delete-all-cloud-data workflow. Clearing local
          data, removing an individual study record, or signing out does not delete the Supabase
          account or all of its cloud records. When an individually synced deletion reaches the
          cloud, sync writes a deletion marker (a tombstone) rather than hard-deleting the row. The
          repository defines no cloud-retention period or tombstone cleanup process.
        </p>
        <p>
          No automatic local or cloud retention schedule is established by the application. Local
          records remain until removed or browser storage is cleared; downloaded backups and
          Supabase data are subject to your handling and the configured services. The repository
          does not implement a way for you to delete all cloud records from the app. Contact the
          operator about privacy questions, but no complete cloud deletion workflow is available in
          StudyDesk.
        </p>
      </PolicySection>

      <PolicySection title="Third-party services and tracking">
        <p>
          The published application is hosted by GitHub Pages. Optional sign-in and cloud sync use
          Supabase Authentication, Database, and Realtime services. Those providers process
          information as needed to provide their services under their own terms and privacy
          documentation. StudyDesk does not control their processing or retention.
        </p>
        <p>
          The repository contains no analytics, advertising, or tracking SDK integration. That
          describes the code reviewed for this notice; it is not a statement about provider or
          hosting logs, or configuration outside the repository. Google is also used as an
          authentication provider when you choose Google sign-in.
        </p>
      </PolicySection>
      <PolicySection title="Contact">
        <p>
          For privacy questions or requests, contact Arun V P at{' '}
          <a
            className="text-accent underline underline-offset-2"
            href={`mailto:${PRIVACY_CONTACT}`}
          >
            {PRIVACY_CONTACT}
          </a>
          .
        </p>
      </PolicySection>
    </PolicyDocument>
  );
}

export function TermsOfServicePage() {
  return (
    <PolicyDocument title="Terms of Service">
      <p>
        These terms describe use of the StudyDesk study-planning application. StudyDesk is intended
        for users worldwide, and local laws may also apply where you live or use it. By using
        StudyDesk, you agree to use it lawfully and consistently with these terms.
      </p>
      <p>
        StudyDesk is operated by Arun V P, an individual developer, and is not presented as a
        registered company. For questions about these terms, contact{' '}
        <a className="text-accent underline underline-offset-2" href={`mailto:${PRIVACY_CONTACT}`}>
          {PRIVACY_CONTACT}
        </a>
        .
      </p>

      <PolicySection title="Permitted use">
        <p>
          You may use StudyDesk for lawful personal study planning, including managing your own
          tasks, timetable, notes, materials, and related study records. Do not use the application
          to break the law, interfere with its operation or services, attempt unauthorized access,
          or infringe another person&apos;s rights.
        </p>
      </PolicySection>

      <PolicySection title="Your content and responsibility">
        <p>
          You are responsible for the content you enter, import, share, or attach; for having the
          rights and permissions needed to use it; and for the accuracy and suitability of your
          records. Do not upload or store content you are not entitled to use. You are responsible
          for protecting access to your device, browser profile, account email, and exported
          backups.
        </p>
      </PolicySection>

      <PolicySection title="Accounts and authentication">
        <p>
          StudyDesk can be used locally without an account. Where optional Supabase sync is
          configured, the current application offers passwordless email sign-in links and Google
          OAuth through Supabase. It does not provide email/password sign-in or password reset. You
          must use only an account you are authorized to access and protect access to its email or
          Google account.
        </p>
        <p>
          Sign-out switches away from the authenticated local profile but does not delete local
          records or the Supabase account. The application currently has no account-deletion flow.
        </p>
      </PolicySection>

      <PolicySection title="Local storage and backups">
        <p>
          StudyDesk stores records in your browser and attachment files in IndexedDB. Local data is
          not a server backup and may be lost when browser data is removed, a device or browser is
          changed, or storage is unavailable. You are responsible for exporting backups you need and
          for securing downloaded files. ZIP integrity checks do not encrypt a backup.
        </p>
        <p>
          The Settings &quot;Clear all data&quot; action attempts to clear StudyDesk data from the
          active local profile, but does not guarantee complete removal of all local data. It does
          not sign you out or clear Supabase&apos;s persisted authentication session, close your
          account, or erase cloud copies.
        </p>
      </PolicySection>

      <PolicySection title="Cloud synchronization limits">
        <p>
          Sync is optional and depends on a correctly configured Supabase project, network access,
          and service availability. Initial upload or restore requires your choice in Settings. Sync
          covers supported planner records and Study Materials metadata, not attachment bytes.
          Uploads, restores, and later changes can fail, be delayed, or require recovery. Sync is
          not a substitute for a complete backup, and the application does not promise that every
          device will always contain identical or complete data.
        </p>
        <p>
          Deleting an individually synced record can leave a cloud deletion marker. There is no
          user-facing operation to delete the account or all cloud data.
        </p>
      </PolicySection>

      <PolicySection title="Third-party services">
        <p>
          GitHub Pages hosts the application. Supabase provides optional authentication, database,
          and realtime synchronization; Google provides authentication when you choose Google
          sign-in. These services are subject to their own terms, policies, and availability.
          StudyDesk does not control third-party services or external sites you choose to open from
          your records.
        </p>
      </PolicySection>

      <PolicySection title="Availability and changes">
        <p>
          StudyDesk is provided without a promise of uninterrupted availability, continued feature
          support, error-free operation, or preservation of data. The operator may update, suspend,
          or discontinue the application or these terms. Updated terms will be posted on this page
          with a revised date; continued use after an update is subject to applicable law.
        </p>
      </PolicySection>

      <PolicySection title="Disclaimer and liability">
        <p>
          To the extent permitted by applicable law, StudyDesk is provided &quot;as is&quot; and
          &quot;as available&quot;, without warranties that cannot lawfully be excluded. To the
          extent permitted by law, the operator is not responsible for indirect or consequential
          loss, loss of data, or interruption arising from use of the application or third-party
          services. Nothing in these terms excludes liability or consumer rights that applicable law
          does not allow to be excluded or limited.
        </p>
      </PolicySection>

      <PolicySection title="Governing law">
        <p>
          These terms are intended to be governed by applicable Indian law, with Kerala, India as
          the intended jurisdiction, subject to any applicable mandatory laws, consumer protections,
          and rights that cannot be excluded. This clause is subject to legal review and does not
          displace laws that apply to users in other jurisdictions.
        </p>
      </PolicySection>
    </PolicyDocument>
  );
}
