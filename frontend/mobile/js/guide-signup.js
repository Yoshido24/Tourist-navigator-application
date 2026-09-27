function setupGuideSignupForm() {
  const applicationForm = document.getElementById('guide-auth-application-form');
  applicationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(applicationForm);
    await updateState((currentState) => ({
      ...currentState,
      guideApplications: [{
        id: `guide-application-${Date.now()}`,
        name: data.get('name') || '',
        email: data.get('email') || '',
        specialty: data.get('specialty') || '',
        contact: data.get('contact') || '',
        address: data.get('address') || '',
        idNumber: data.get('idNumber') || '',
        experience: data.get('experience') || '',
        password: data.get('password') || '',
        availability: data.get('availability') || '',
        interviewDate: data.get('interviewDate') || '',
        interviewTime: data.get('interviewTime') || '',
        interviewLocation: 'Montalban Tourism Office',
        status: 'Pending'
      }, ...(currentState.guideApplications || [])]
    }));
    applicationForm.reset();
    const message = document.getElementById('guide-auth-application-message');
    if (window.lastSyncErrors?.guideApplications) {
      const syncError = window.lastSyncErrors.guideApplications;
      const isRlsError = syncError?.code === '42501' || /row-level security/i.test(syncError?.message || '');
      message.textContent = isRlsError
        ? 'Application saved on this device only. Supabase is blocking guide applications with Row Level Security. Run the RLS fix migration so Admin can receive it.'
        : 'Application saved on this device only. It could not reach the shared database, so Admin will not see it yet. Ask Admin to check the Supabase setup.';
    } else {
      message.textContent = 'Application submitted. Admin approval is required before you can log in.';
    }
    message.hidden = false;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  appState = await loadState();
  setupGuideSignupForm();
});
