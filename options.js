const ZOOM_LEVEL_1_KEY = 'zoom_level_1';
const ZOOM_LEVEL_2_KEY = 'zoom_level_2';
const ZOOM_LEVEL_3_KEY = 'zoom_level_3';

document.addEventListener('DOMContentLoaded', () => {
  // Load saved zoom levels and populate the form
  chrome.storage.sync.get(
    [ZOOM_LEVEL_1_KEY, ZOOM_LEVEL_2_KEY, ZOOM_LEVEL_3_KEY],
    (result) => {
      document.getElementById('zoom1').value = result[ZOOM_LEVEL_1_KEY] || '';
      document.getElementById('zoom2').value = result[ZOOM_LEVEL_2_KEY] || '';
      document.getElementById('zoom3').value = result[ZOOM_LEVEL_3_KEY] || '';
    },
  );

  // Save the zoom levels when the form is submitted
  document.getElementById('zoomForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const zoom1 = parseInt(document.getElementById('zoom1').value);
    const zoom2 = parseInt(document.getElementById('zoom2').value);
    const zoom3 = parseInt(document.getElementById('zoom3').value);

    chrome.storage.sync.set(
      {
        [ZOOM_LEVEL_1_KEY]: zoom1,
        [ZOOM_LEVEL_2_KEY]: zoom2,
        [ZOOM_LEVEL_3_KEY]: zoom3,
      },
      () => {
        // Display a message to the user to indicate that the zoom levels have been saved
        const status = document.getElementById('status');
        status.textContent = 'Zoom levels saved.';
        setTimeout(() => {
          status.textContent = '';
        }, 2000);
      },
    );
  });
});
