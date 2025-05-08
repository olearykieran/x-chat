/**
 * Render the Schedule panel
 * @param {Object} props - Component props
 * @returns {HTMLElement} - Schedule panel element
 */
export function renderSchedulePanel({ settings, onGeneratePosts, onSchedulePosts, generatedPosts, isGenerating }) {
  const panel = document.createElement('div');
  panel.className = 'schedule-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'schedule-header';
  const title = document.createElement('h2');
  title.textContent = 'Schedule Posts';
  header.appendChild(title);
  panel.appendChild(header);

  // Generated Posts Display Area
  const postsDisplaySection = document.createElement('div');
  postsDisplaySection.id = 'generatedPostsDisplay';
  postsDisplaySection.className = 'schedule-section posts-display';
  panel.appendChild(postsDisplaySection);

  if (generatedPosts && generatedPosts.length > 0) {
    const postsTitle = document.createElement('h3');
    postsTitle.textContent = 'Generated Posts:';
    postsDisplaySection.appendChild(postsTitle);

    generatedPosts.forEach((post, index) => {
      const postContainer = document.createElement('div');
      // Apply message bubble styling
      postContainer.className = 'message ai generated-post-item';
      
      const postTextArea = document.createElement('textarea');
      postTextArea.value = post.content;
      postTextArea.id = `post-content-${index}`;
      postTextArea.className = 'schedule-post-textarea'; 

      // Essential styles for layout - min-height and line-height MUST be set in CSS
      postTextArea.style.overflowY = 'auto'; 
      postTextArea.style.resize = 'none'; 
      postTextArea.style.boxSizing = 'border-box'; 
      postTextArea.style.width = '100%'; 
      postTextArea.style.display = 'block'; 
      
      postContainer.appendChild(postTextArea); // Append textarea to container first

      const autoGrow = (element) => {
        const minRows = 4; // Set a minimum number of rows as a baseline
        const currentVal = element.value;
        // Count newline characters. Add 1 for the first line.
        const lineCount = (currentVal.match(/\n/g) || []).length + 1;
        element.rows = Math.max(minRows, lineCount);
        // NO element.style.height or element.style.minHeight manipulation here.
        // Relies purely on 'rows' attribute and CSS for height behavior.
      };

      // Initial grow, deferred to next frame
      requestAnimationFrame(() => {
        autoGrow(postTextArea);
      });

      // Grow on input
      postTextArea.addEventListener('input', function() { 
        autoGrow(this);
      });
      
      // Individual Scheduling Controls for each post
      const individualScheduleControls = document.createElement('div');
      // Apply message actions styling
      individualScheduleControls.className = 'message-actions individual-schedule-controls'; 

      const timeSelectLabel = document.createElement('label');
      timeSelectLabel.htmlFor = `time-select-${index}`;
      timeSelectLabel.textContent = 'Schedule in: ';
      timeSelectLabel.style.marginRight = '5px';

      const timeSelect = document.createElement('select');
      timeSelect.id = `time-select-${index}`;
      // Add a class for styling the select (e.g., 'message-select' or 'themed-select')
      timeSelect.className = 'schedule-time-select message-button'; // Re-using message-button for similar style, or use a dedicated class
      const timeOptions = [
        { value: '1', label: '1 Hour' },
        { value: '2', label: '2 Hours' },
        { value: 'custom', label: 'Custom Time...' }
      ];
      timeOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        timeSelect.appendChild(option);
      });

      const customTimeInput = document.createElement('input');
      customTimeInput.type = 'datetime-local';
      customTimeInput.id = `custom-time-input-${index}`;
      customTimeInput.style.display = 'none'; // Initially hidden
      customTimeInput.style.marginLeft = '5px';
      // Add a class for styling the datetime input
      customTimeInput.className = 'schedule-custom-time-input message-button'; // Re-using for consistency

      timeSelect.addEventListener('change', (e) => {
        if (e.target.value === 'custom') {
          customTimeInput.style.display = 'inline-block';
          // Set a default future time for convenience
          const now = new Date();
          now.setHours(now.getHours() + 1); // Default to one hour in the future
          now.setMinutes(0); // Align to the hour
          customTimeInput.value = now.toISOString().substring(0, 16); // Format for datetime-local
        } else {
          customTimeInput.style.display = 'none';
        }
      });

      const scheduleButton = document.createElement('button');
      // Use more subtle button styling, similar to Reply tab action buttons
      scheduleButton.className = 'message-button schedule-action-button'; // Using 'message-button' class
      scheduleButton.textContent = 'Schedule Post';
      scheduleButton.addEventListener('click', () => {
        const postContent = document.getElementById(`post-content-${index}`).value;
        const scheduleType = timeSelect.value; // '1', '2', or 'custom'
        let scheduleValue;

        if (scheduleType === 'custom') {
          scheduleValue = customTimeInput.value; // Get value from datetime-local input
          if (!scheduleValue) {
            alert('Please select a custom date and time.');
            return;
          }
          // Basic validation: Ensure it's in the future (datetime-local gives ISO-like string)
          if (new Date(scheduleValue) <= new Date()) {
            alert('Custom time must be in the future.');
            return;
          }
        } else {
          scheduleValue = scheduleType; // This will be '1' or '2' (hours)
        }
        
        // The second argument to onSchedulePosts is now the actual value or hours string
        onSchedulePosts([{ content: postContent, scheduledTime: scheduleType }], scheduleValue);
      });

      individualScheduleControls.appendChild(timeSelectLabel);
      individualScheduleControls.appendChild(timeSelect);
      individualScheduleControls.appendChild(customTimeInput); // Add custom time input next to select
      individualScheduleControls.appendChild(scheduleButton);
      
      postContainer.appendChild(individualScheduleControls);
      postsDisplaySection.appendChild(postContainer);
    });
  }

  return panel;
}
