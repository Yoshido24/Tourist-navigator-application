(function () {
  const bucketName = 'event-banners';
  const allowedTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const maxFileSize = 5 * 1024 * 1024;
  const input = (id) => document.getElementById(id);

  function setMessage(text, isError = false) {
    const message = input('announcement-message');
    message.textContent = text;
    message.classList?.toggle('error-message', isError);
    message.hidden = false;
  }

  function getCurrentAnnouncements() {
    return typeof appState !== 'undefined' ? appState.announcements || [] : [];
  }

  function updateAnnouncements(items) {
    if (typeof appState !== 'undefined') appState.announcements = items;
    render(items);
  }

  function publicUrl(path) {
    return path ? supabaseClient.storage.from(bucketName).getPublicUrl(path).data?.publicUrl || '' : '';
  }

  function localDateTime(value) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function render(announcements = []) {
    const list = input('announcements-list');
    if (!list) return;
    const items = [...announcements].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    list.innerHTML = items.map((item) => `
      <article class="dashboard-card announcement-admin-card">
        ${item.banner_path ? `<img class="announcement-admin-banner" src="${escapeHtml(publicUrl(item.banner_path))}" alt="">` : ''}
        <h4>${escapeHtml(item.title)}</h4>
        <p><strong>${escapeHtml(item.venue)}</strong><br>${escapeHtml(new Date(item.starts_at).toLocaleString())} – ${escapeHtml(new Date(item.ends_at).toLocaleString())}</p>
        <p>${escapeHtml(item.organizer)}</p>
        <div class="attraction-management-actions">
          <button class="btn btn-secondary" type="button" data-edit-announcement="${escapeHtml(item.id)}">Edit</button>
          <button class="btn btn-secondary" type="button" data-delete-announcement="${escapeHtml(item.id)}">Delete</button>
        </div>
      </article>`).join('') || '<p class="empty-state">No event announcements yet.</p>';

    list.querySelectorAll('[data-edit-announcement]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = items.find((announcement) => announcement.id === button.dataset.editAnnouncement);
        if (!item) return;
        input('announcement-id').value = item.id;
        input('announcement-title').value = item.title;
        input('announcement-description').value = item.description;
        input('announcement-organizer').value = item.organizer;
        input('announcement-venue').value = item.venue;
        input('announcement-starts-at').value = localDateTime(item.starts_at);
        input('announcement-ends-at').value = localDateTime(item.ends_at);
        input('announcement-submit').textContent = 'Save announcement';
        input('announcement-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    list.querySelectorAll('[data-delete-announcement]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = items.find((announcement) => announcement.id === button.dataset.deleteAnnouncement);
        if (!item || !window.confirm(`Delete "${item.title}"?`)) return;
        button.disabled = true;
        try {
          const { data, error } = await supabaseClient.from('announcements')
            .delete().eq('id', item.id).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Announcement was not deleted. Refresh and try again.');
          updateAnnouncements(getCurrentAnnouncements().filter((announcement) => announcement.id !== item.id));
          if (input('announcement-id').value === item.id) resetForm();
          const { error: storageError } = await supabaseClient.storage.from(bucketName).remove([item.banner_path]);
          if (storageError) setMessage(`Announcement deleted, but its banner could not be removed: ${storageError.message}`, true);
          else setMessage('Announcement deleted.');
        } catch (error) {
          setMessage(error.message, true);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function resetForm() {
    input('announcement-form').reset();
    input('announcement-id').value = '';
    input('announcement-submit').textContent = 'Publish announcement';
    input('announcement-message').hidden = true;
    input('announcement-message').textContent = '';
  }

  async function saveAnnouncement(event) {
    event.preventDefault();
    const form = input('announcement-form');
    if (form.dataset.saving === 'true') return;

    const id = input('announcement-id').value;
    const existing = getCurrentAnnouncements().find((item) => item.id === id);
    const banner = input('announcement-banner').files[0] || null;
    const startsAt = new Date(input('announcement-starts-at').value);
    const endsAt = new Date(input('announcement-ends-at').value);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
      return setMessage('Choose a valid event start and end time.', true);
    }
    if (!existing && !banner) return setMessage('Choose a banner image before publishing.', true);
    if (banner && (!allowedTypes[banner.type] || !banner.size || banner.size > maxFileSize)) {
      return setMessage('Banner images must be JPEG, PNG or WebP and no larger than 5 MB.', true);
    }

    form.dataset.saving = 'true';
    const submit = event.submitter || input('announcement-submit');
    submit.disabled = true;
    let uploadedPath = null;
    try {
      let bannerPath = existing?.banner_path;
      if (banner) {
        const path = `${crypto.randomUUID()}.${allowedTypes[banner.type]}`;
        const { error } = await supabaseClient.storage.from(bucketName).upload(path, banner);
        if (error) throw new Error(`Banner upload failed: ${error.message}`);
        uploadedPath = path;
        bannerPath = path;
      }

      const announcement = {
        id: existing?.id || `announcement-${crypto.randomUUID()}`,
        title: input('announcement-title').value.trim(),
        description: input('announcement-description').value.trim(),
        organizer: input('announcement-organizer').value.trim(),
        venue: input('announcement-venue').value.trim(),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        banner_path: bannerPath
      };
      const result = existing
        ? await supabaseClient.from('announcements').update(announcement)
          .eq('id', existing.id).select('id').maybeSingle()
        : await supabaseClient.from('announcements').insert(announcement);
      if (result.error) throw result.error;
      if (existing && !result.data) throw new Error('Announcement was not updated. Refresh and try again.');

      updateAnnouncements(existing
        ? getCurrentAnnouncements().map((item) => item.id === existing.id ? announcement : item)
        : [announcement, ...getCurrentAnnouncements()]);
      if (existing?.banner_path && uploadedPath) {
        try {
          const { error } = await supabaseClient.storage.from(bucketName).remove([existing.banner_path]);
          if (error) throw error;
        } catch (error) {
          setMessage(`Announcement saved, but its previous banner could not be removed: ${error.message}`, true);
          resetForm();
          return;
        }
      }
      resetForm();
      setMessage(existing ? 'Announcement updated.' : 'Announcement published.');
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabaseClient.storage.from(bucketName).remove([uploadedPath]);
        if (cleanupError) {
          console.error('Unable to remove an unused announcement banner.', cleanupError);
          setMessage(`${error.message} Cleanup failed: ${cleanupError.message}`, true);
          return;
        }
      }
      setMessage(error.message, true);
    } finally {
      delete form.dataset.saving;
      submit.disabled = false;
    }
  }

  function setup() {
    input('announcement-form')?.addEventListener('submit', saveAnnouncement);
    input('announcement-cancel')?.addEventListener('click', resetForm);
  }

  window.AdminAnnouncementsFeature = { render, setup };
})();
