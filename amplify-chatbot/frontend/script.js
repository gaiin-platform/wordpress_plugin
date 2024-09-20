const apiUrl = amplifyChatbotSettings.apiUrl;
const AMPLIFY = 'amplify';
const USER = 'user';
const ASSISTANT = 'assistant';
const FAIL_MESSAGE = 'We are unable to reach Amplify at this time, please refresh the page and try again.';
let content = [];
let conversationTranscript = [];
let botConfigData = {};
let button = null;
let messageInput = '';
let chatIcon = null;
let disclaimer = null;
let disclaimerContent = null;
let stars = null;

let selectedGroupType = undefined;
let canStartChatting = false;
let isInitialized = false;
let conversationId = uuidv4();
let feedbackSubmitted = false;


///////////////////  On Load  /////////////////// 
document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('.chat__title').textContent = amplifyChatbotSettings.assistantName;
    button = document.querySelector('.lwh-open-cbot #submit-btn');
    disableButton(true);
    messageInput = document.querySelector('.lwh-open-cbot #message');
    chatIcon = document.querySelector('.vanderbilt-chat-icon');
    disclaimer = document.querySelector('.disclaimer');
    disclaimerContent = document.querySelector('.disclaimer-content');

    stars = document.querySelector('.star-rating');


    fetchBotConfiguration();
    console.log(amplifyChatbotSettings.apiUrl);

    messageInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            if (canStartChatting) {
                event.preventDefault();
                button.click();
            } else {
                event.preventDefault(); // Prevent the newline from being added
                messageInput.value = messageInput.value.trim();
            }
        }
    });

    button.addEventListener('click', async function (event) {
        event.preventDefault();
        const userMessage = messageInput.value.trim();
        if (userMessage) {
            // Add user's message to the chat display
            addChatMessage(USER, userMessage);
            messageInput.value = '';  // Clear the input field
            // Fetch data with assistant response streaming
            fetchChatData();
            // postUserMessage(userMessage);
            // setTimeout(startSSE, 300); 
        }
    });


    document.addEventListener('click', function (event) {
        const menuDropdown = document.getElementById('menuDropdown');
        const menuIcon = document.querySelector('.chat__menu-icon');

        // If the menu is open and the click is outside the menu, close it
        if (menuDropdown.style.display === 'block' && !menuDropdown.contains(event.target) && !menuIcon.contains(event.target)) {
            menuDropdown.style.display = 'none';
        }
    });

});




///////////////////  SSE  /////////////////// 

function startSSE() {
    // Ensure the correct API endpoint for SSE
    const sseUrl = `${apiUrl}?conversation_id=${conversationId}`;
    const eventSource = new EventSource(sseUrl);  // Create the SSE connection
    let assistantMessage = '';


    eventSource.onmessage = function (event) {
        try {
            const data = JSON.parse(event.data);
            if (data.message) {
                if (data.message === 'CLOSE_CONNECTION') {
                    eventSource.close();
                    closeOut();
                } else {
                    replaceTypingAnimationWithMessage(AMPLIFY, data.message);
                    assistantMessage += data.message;
                }


            } else {
                console.log('No message field in received data:', data);
            }
        } catch (e) {
            console.error('Error parsing SSE data:', e, 'Event data:', event.data);
        }
    };


    eventSource.onerror = function (error) {
        console.error('SSE connection error', error);
        eventSource.close();  // Close the connection on error
        // setTimeout(startSSE, 3000); // Retry connection after 3 seconds
        disableButton(false);
    };

    eventSource.onopen = function () {
        console.log('SSE connection opened');
    };

    eventSource.onclose = function () {
        console.log('SSE connection closed.');
        closeOut();
    };

    const closeOut = () => {
        disableButton(false);  // Re-enable the submit button when the stream ends
        if (botConfigData.disclaimer) setupDisclaimer();
        content.push({
            role: ASSISTANT,
            message: assistantMessage,
        });

        conversationTranscript.push({
            sender: AMPLIFY,
            time: new Date().toLocaleString(),
            message: message,
        });
    }
}


async function postUserMessage(message) {
    disableButton(true);
    addChatTypingAnimation(AMPLIFY);
    try {
        const response = await fetch(apiUrl + '/chat/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': amplifyChatbotSettings.nonce
            },
            body: JSON.stringify({
                "assistant_name": botConfigData.assistantName,
                "conversation_history": content.map(item => ({
                    "role": item.role,
                    "content": item.message
                })),
                "conversation_id": conversationId,
                "group_id": botConfigData.groupId,
                "prompt": botConfigData.prompt,
                'group_type': selectedGroupType,
                "model": botConfigData.model,
                'num_prompts': content.length,
            })
        });

        if (!response.ok) {
            throw new Error("Failed to post the user's message.");
        }
    } catch (error) {
        toggleShowPopupMessage(FAIL_MESSAGE, '#991a1a');
        console.error('Failed to post user message:', error);
        disableButton(false);
    }
}



///////////////////  On Load Configuration  /////////////////// 
async function fetchBotConfiguration() {
    const chatMessagesContainer = document.querySelector(".lwh-open-cbot .chat__messages");
    document.querySelector(".lwh-open-cbot .loading").style.display = 'flex';
    chatMessagesContainer.innerHTML = '';
    let botResponse = ''
    try {
        botResponse = await fetch(amplifyChatbotSettings.botConfigurationUrl);
        if (botResponse.ok) { ////////

            botConfigData = await botResponse.json();

            // console.log("API Response:", botConfigData); // Check what the API returned

            if (!botConfigData) {
                throw new Error('Invalid configuration data');
            }

            const astTitle = document.querySelector('.lwh-open-cbot .chat__title');
            if (botConfigData.assistantName) astTitle.textContent = botConfigData.assistantName;

            chatMessagesContainer.style.fontSize = `${botConfigData.fontSize}px`;

            // remove loading display
            document.querySelector(".lwh-open-cbot .loading").style.display = 'none';
            document.querySelector(".lwh-open-cbot .chat__status").innerHTML = `<span></span> Online`;
            document.querySelector(".lwh-open-cbot .chat__status").querySelector("span").style.background = "#68D391";

            const isOpen = document.querySelector(".lwh-open-cbot .chat").classList.contains('show');

            if (isOpen && !isInitialized) {
                initializeData();
            }

        } else {
            document.querySelector(".lwh-open-cbot .loading").style.display = 'none';
            toggleShowPopupMessage(FAIL_MESSAGE, '#991a1a');
            throw new Error("Request failed. Please try again! " + botResponse.status);
        }
    } catch (error) {
        console.log(error);
        toggleShowPopupMessage(FAIL_MESSAGE, '#991a1a');
        return;
    }
}

/////////////////// On Load Messages /////////////////// 

async function initializeData() {
    isInitialized = true;
    // starter message 
    if (botConfigData.startUpMessage) {
        await addChatTypingAnimation(AMPLIFY, 1000);
        replaceTypingAnimationWithMessage(AMPLIFY, botConfigData.startUpMessage);
        conversationTranscript.push({
            sender: AMPLIFY,
            time: new Date().toLocaleString(),
            message: botConfigData.startUpMessage,
        });
    }

    if (botConfigData.groupTypes && Object.keys(botConfigData.groupTypes).length > 0) {
        await addChatTypingAnimation(AMPLIFY, 1000);
        displayGroupTypes(botConfigData.groupTypes, botConfigData.groupTypeQuestions);
    } else {
        disableButton(false);
        canStartChatting = true; // No group types to select
    }

    // setupDisclaimer()
}

function displayGroupTypes(groupTypes, question) {
    // console.log("displayGroupTypes");
    const chatMessagesContainer = document.querySelector(".lwh-open-cbot .chat__messages");
    replaceTypingAnimationWithMessage(AMPLIFY, question);
    conversationTranscript.push({
        sender: AMPLIFY,
        time: new Date().toLocaleString(),
        message: question,
    });

    // Use the existing 'startup-btns' div if it exists, or create a new one
    let typesContainer = document.querySelector(".lwh-open-cbot .startup-btns");
    if (!typesContainer) {
        typesContainer = document.createElement('div');
        typesContainer.classList.add('startup-btns');
        chatMessagesContainer.appendChild(typesContainer);
    }
    typesContainer.style.display = 'flex';
    typesContainer.style.flexDirection = 'row';
    typesContainer.style.flexWrap = 'wrap';
    typesContainer.style.alignItems = 'center';
    typesContainer.style.justifyContent = 'center';

    typesContainer.innerHTML = "";

    Object.keys(groupTypes).sort().forEach(type => {
        const typeButton = document.createElement('p');
        typeButton.textContent = type;
        typeButton.style.cursor = "pointer";
        typeButton.onclick = () => {
            clearDisabledMessage();
            selectedGroupType = type;
            Array.from(typesContainer.children).forEach(btn => btn.classList.remove('active'));
            typeButton.classList.add('active');
            document.querySelector(".lwh-open-cbot .selected-group-type").textContent = type;
            if (groupTypes[type].isDisabled) {
                disableButton(true);
                canStartChatting = false;
                let disabledContainer = document.createElement('div');
                disabledContainer.className = 'disabled-container'; // Add a class for styling

                let disabledIcon = document.createElement('div');
                disabledIcon.className = 'disabled-icon';

                let disabledMessage = document.createElement('div');
                disabledMessage.className = 'disabled-message';
                disabledMessage.textContent = groupTypes[type].disabledMessage;

                disabledContainer.appendChild(disabledIcon);
                disabledContainer.appendChild(disabledMessage);

                typesContainer.appendChild(disabledContainer);
            } else {
                disableButton(false);
                canStartChatting = true;
            }
        };
        typesContainer.appendChild(typeButton);
    });
}

function clearDisabledMessage() {
    let existingIcon = document.querySelector(".lwh-open-cbot .disabled-icon");
    let existingMessage = document.querySelector(".lwh-open-cbot .disabled-message");
    if (existingIcon) existingIcon.remove();
    if (existingMessage) existingMessage.remove();
}



///////////////////  Toggle Components  /////////////////// 


function toggleShowChatUI() {
    if (!toggleShowSubmitFeedbackPopup(() => continueChatUI())) {
        continueChatUI();
    }
}


function continueChatUI() {
    const chatWindow = document.querySelector(".lwh-open-cbot .chat");
    chatWindow.classList.toggle('show');
    if (chatWindow.classList.contains('show')) {
        document.querySelector(".lwh-open-cbot .custom-chatbot").style.zIndex = '9999';
        if (Object.keys(botConfigData).length > 0 && !isInitialized) {
            initializeData();
        }
        chatIcon.style.animation = 'none';
    } else {
        document.querySelector(".lwh-open-cbot .custom-chatbot").style.zIndex = '9998';
        chatIcon.style.animation = 'pulse 10s infinite';
    }
}




function toggleShowSubmitFeedbackPopup(noCallback) {
    const chatWindow = document.querySelector(".lwh-open-cbot .chat");
    if (!feedbackSubmitted && content.length > 1 && chatWindow.classList.contains('show')) {
        const popup = document.querySelector('.lwh-open-cbot .popup');

        popup.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px;">
                <p>Would you like to submit feedback?</p>
                <div class="popup-buttons">
                    <button class="btn feedback-btn yes-btn">Yes</button>
                    <button class="btn feedback-btn no-btn">No</button>
                </div>
            </div>
        `;

        popup.classList.add('popup-animation-static');
        popup.style.display = 'block';
        popup.style.opacity = 1;

        const yesBtn = document.querySelector('.yes-btn');
        const noBtn = document.querySelector('.no-btn');

        yesBtn.onclick = function() {
            popup.style.display = 'none';
            popup.style.opacity = 0;
            popup.innerHTML = ''; 
            toggleShowMenuActionPage('feedback');
        };

        noBtn.onclick = function() {
            popup.style.display = 'none';
            popup.style.opacity = 0;
            popup.innerHTML = '';
            if (noCallback) {
                noCallback();
            }
        };

        return true;
    }
    return false; 
}





function toggleShowPopupMessage(val, color) {
    const popup = document.querySelector('.lwh-open-cbot .popup');
    popup.classList.remove('popup-animation-static');
    popup.innerHTML = '<p></h2>';
    popup.style.display = 'block';
    popup.style.opacity = 1;
    const innerPopup = popup.querySelector('p');
    innerPopup.innerText = val;
    innerPopup.style.color = color;
    popup.classList.add('popup-animation');
    setTimeout(() => {
        popup.classList.remove('popup-animation');
        popup.style.display = 'none';
        popup.style.opacity = 0;
    }, 3000);
}

function toggleShowMenu() {
    const menuDropdown = document.getElementById('menuDropdown');
    if (menuDropdown.style.display === 'none' || menuDropdown.style.display === '') {
        menuDropdown.style.display = 'block';
    } else {
        menuDropdown.style.display = 'none';
    }
}


function toggleShowDisclaimer() {
    const disclaimerText = document.querySelector('.disclaimer-text');
    const icon = document.querySelector('.disclaimer__close-icon i');
    if (disclaimerContent.classList.contains('collapsed')) {
        disclaimerContent.classList.remove('collapsed');
        icon.className = 'fas fa-angle-down';
        disclaimerText.innerText = botConfigData.disclaimer;
    } else {
        disclaimerContent.classList.add('collapsed');
        icon.className = 'fas fa-angle-up';
        disclaimerText.innerText = "Please view the disclaimer";
    }
    adjustMessagesHeight();
    adjustStarRatingPositionForDisclaimer();
    checkVisbility();
}

function toggleShowMenuActionPage(page) {
    clearForm(); // Clear the form every time we switch
    document.querySelector('.chat-container').style.display = 'none';
    document.querySelector('.menu-forms-container').style.display = 'block';
    document.querySelector('.form-container').style.display = 'block';

    const formContainer = document.querySelector('.form-container form');

    // console.log(page);

    switch (page) {
        case "feedback":
            formContainer.innerHTML = formTitle("Submit Conversation Feedback") +
                // nameFormGroup() +
                emailFormGroup() +
                messageFormGroup("Your feedback") +
               '<div id="starRatingPlaceholder" style="height: 44px;"></div>' +
                submitButton("submit-feedback-button");
            document.getElementById("submit-feedback-button").addEventListener('click', submitUserRating);
            stars.style.visibility = 'visible';    
            adjustStarRatingPositionForForm();
            break;
        case "follow_up":
            stars.style.visibility = 'hidden';    
            formContainer.innerHTML = formTitle("Request Follow-up") +
                // nameFormGroup() +
                emailFormGroup() +
                messageFormGroup("Additional comments (optional)") +
                // checkbox 
                `<div class="checkbox-wrapper" style="margin-left: 16px; margin-bottom: 10px;">
                    <label>
                        <input type="checkbox" class="includeConversation"/>
                        <span class="custom-checkbox"></span>
                        <span class="label-text">Include conversation</span>
                    </label>
                </div>` +
                submitButton("submit-followup-button");
            document.getElementById("submit-followup-button").addEventListener('click', submitFollowUp);
            break;
        case "email_conversation":
            stars.style.visibility = 'hidden';    
            formContainer.innerHTML = formTitle("Email Conversation Transcript") +
                emailFormGroup() +
                ` <div class="form-group message">
                    <textarea id="formSubject" class="form-control" rows="1" placeholder="Email Subject"></textarea>
                </div> ` + 
                messageFormGroup("Email body") +
                submitButton("send-email-button");
            document.getElementById("send-email-button").addEventListener('click', sendEmailConversation);
            break;
    }
    disableButton(true);
    toggleShowMenu();
}

function toggleShowChatPage() {
    document.querySelector('.menu-forms-container').style.display = 'none';
    document.querySelector('.form-container').style.display = 'none';
    document.querySelector('.chat-container').style.display = 'block';
    if (disclaimer.style.display === 'none') {
        stars.style.bottom = '80px';
        stars.style.removeProperty('top');
    } else {
        adjustStarRatingPositionForDisclaimer();
        checkVisbility();
    }  
    disableButton(false);
    clearForm();
}




///////////////////  Add Messages to Conversation  /////////////////// 

function addChatMessage(sender, message) {
    content.push({
        role: sender === AMPLIFY ? ASSISTANT : USER,
        message: message,
    });
    conversationTranscript.push({
        sender: sender,
        time: new Date().toLocaleString(),
        message: message,
        selectedGroupType: selectedGroupType
    });
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    let messageContainer = document.createElement('div');
    messageContainer.classList.add('chat__messages__' + sender);
    let messageDiv = document.createElement('div');
    messageDiv.innerHTML = ` <p>${message} </p> `;
    messageContainer.appendChild(messageDiv);
    chatMessagesContainer.appendChild(messageContainer);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function addChatTypingAnimation(sender, timeout = 0) {
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    let typingContainer = document.createElement('div');
    typingContainer.classList.add('chat__messages__' + sender);
    let typingAnimationDiv = document.createElement('div');
    typingAnimationDiv.classList.add('typing-animation');
    typingAnimationDiv.innerHTML = amplifyTyping();

    typingContainer.appendChild(typingAnimationDiv);
    chatMessagesContainer.appendChild(typingContainer);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    return new Promise(resolve => setTimeout(() => {
        resolve(); // Resolve the promise to signal that the animation is complete
    }, timeout));
}

function replaceTypingAnimationWithMessage(sender, message) {
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    let typingContainer = document.querySelector('.lwh-open-cbot .chat__messages__' + sender + ':last-child');
    if (typingContainer) {
        let messageContainer = typingContainer;
        let messageDiv = messageContainer.querySelector('.message');
        // Remove the typing SVG
        if (messageDiv) {
            let typingSVG = messageDiv.querySelector('svg');
            if (typingSVG) {
                typingSVG.remove();
            }
            // Find or create a text node for appending message chunks
            let textNode = Array.from(messageDiv.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
            if (!textNode) {
                textNode = document.createTextNode('');
                messageDiv.appendChild(textNode);
            }
            // Append the new message chunk
            textNode.textContent += message;
        } else {
            console.error('messageDiv not found in typingContainer', typingContainer);
        }

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
}



///////////////////  Requests  /////////////////// 

async function fetchChatData() {
    disableButton(true);
    try {
        addChatTypingAnimation(AMPLIFY);

        response = await fetch(apiUrl + '/chat/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': amplifyChatbotSettings.nonce
            },
            //if there is a start up message skip the first message
            body: JSON.stringify({
                "assistant_name": botConfigData.assistantName,
                "conversation_history": content.map(item => ({
                    "role": item.role,
                    "content": item.message
                })),
                "conversation_id": conversationId,
                "group_id": botConfigData.groupId,
                "prompt": botConfigData.prompt,
                "group_type": selectedGroupType,
                "model": botConfigData.model,
                "num_prompts": Math.ceil(content.length / 2),
                "user": amplifyChatbotSettings.userEmail || 'unknown'
            })
        });

        if (response.ok) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let partialData = '';
            let assistantMessage = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break; // End of stream

                // Decode the chunk and append to the buffer
                const chunk = decoder.decode(value, { stream: true });
                partialData += chunk;

                // Split into lines to process JSON
                const lines = partialData.split('\n');
                partialData = lines.pop();
                for (const line of lines) {
                    if (line) {
                        console.log(line, "\n\n");
                        const jsonResponse = JSON.parse(line);
                        const messageChunk = jsonResponse.message;
                        assistantMessage += messageChunk;
                        replaceTypingAnimationWithMessage(AMPLIFY, messageChunk);
                    }
                }
            }

            // Update the conversation history
            content.push({
                role: ASSISTANT,
                message: assistantMessage,
            });

            conversationTranscript.push({
                sender: AMPLIFY,
                time: new Date().toLocaleString(),
                message: assistantMessage,
            });

            disableButton(false);
            if (botConfigData.disclaimer) setupDisclaimer();
            adjustStarRatingPositionForDisclaimer();

        } else {
            toggleShowPopupMessage(FAIL_MESSAGE, '#991a1a');
            throw new Error("Request failed. Please try again!");
        }

    } catch (error) {
        clearConversation(false)
        toggleShowPopupMessage(FAIL_MESSAGE, '#991a1a');
        console.error('There was a problem with the fetch operation:', error);
        document.querySelector(".lwh-open-cbot .chat__status").innerHTML = `<span></span> Offline`;
        document.querySelector(".lwh-open-cbot .chat__status").querySelector("span").style.background = "#acacac";

        return;
    }
}


async function submitUserRating() {
    console.log("submitting rating" );
    const feedbackButton = document.getElementById("submit-feedback-button");
    if (feedbackButton) {
        feedbackButton.textContent = "Sending...";  
        feedbackButton.disabled = true;
    }

    try {
        const rating = document.querySelector('.star-rating input[name="stars"]:checked');
        const ratingValue = rating ? rating.id.replace('star', '') : '5';
        console.log(ratingValue);

        const feedbackElement = document.getElementById('formMessage');

        const response = await fetch(`${amplifyChatbotSettings.apiUrl}/submit-rating/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': amplifyChatbotSettings.nonce
            },
            body: JSON.stringify({
                conversationId: conversationId,
                userRating: parseInt(ratingValue),
                userFeedback: feedbackElement ? feedbackElement.value : '',
            })
        });

        if (!response.ok) {
            throw new Error('Failed to submit rating');
        }

        const result = await response.json();
        if (result.success) {
            feedbackSubmitted = true;
            if (feedbackButton) feedbackButton.textContent = "Thanks!"; 
            toggleShowPopupMessage('Feedback submitted successfully.', 'black');
        } else {
            toggleShowPopupMessage('Failed to submit rating, please try again later.', '#991a1a');
        }
    } catch (error) {
        console.error('Error submitting rating:', error);
        toggleShowPopupMessage('Failed to submit rating, please try again later.', '#991a1a'); 
    }
    setTimeout(() => {
        if (document.getElementById("submit-feedback-button")) {
            feedbackButton.textContent = "Submit";
            feedbackButton.disabled = false;
        }
    }, 800);
}



async function submitFollowUp() {
    const followupButton = document.getElementById("submit-followup-button");
    followupButton.textContent = "Sending...";  
    followupButton.disabled = true;
    const email = document.getElementById('formEmail').value;
    const message = document.getElementById('formMessage').value;
    const includeConversation = document.querySelector('.includeConversation').checked;

    const conversation = includeConversation ? `Conversation Id: ${conversationId}\n${getConversationTranscript()}`
                              : '\nUser chose not to include the chatbot conversation.';
    const subject = `${botConfigData.assistantName} Follow-up Request - Amplify`;
    const body =  `From: ${email} \n\n${message}\n\n${conversation}`;

    try {
        const response = await fetch(`${amplifyChatbotSettings.apiUrl}/follow-up/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': amplifyChatbotSettings.nonce
            },
            body: JSON.stringify({
                subject: subject,
                body: body
            })
        });

        if (!response.ok) {
            throw new Error('Failed to submit follow-up request');
        }

        const result = await response.json();
        if (result.success) {
            followupButton.textContent = "Received!"; 
            toggleShowPopupMessage('Follow-up request submitted successfully.', 'black');
        } else {
            toggleShowPopupMessage('Failed to submit follow-up request, please try again later.', '#991a1a');
        }
        
    } catch (error) {
        console.error('Error submitting follow-up request:', error);
        toggleShowPopupMessage('Failed to submit follow-up request, please try again later.', '#991a1a');
    }
    setTimeout(() => {
        if (document.getElementById("submit-followup-button")) {
            followupButton.textContent = "Submit";
            followupButton.disabled = false;
        }
    }, 800);
   
}


async function sendEmailConversation() {
    const emailButton = document.getElementById("send-email-button");
    emailButton.textContent = "Sending...";  
    emailButton.disabled = true;

    const email = document.getElementById('formEmail').value;
    const subject = document.getElementById('formSubject').value;
    const message = document.getElementById('formMessage').value;

    const body = `${message}\n\n${getConversationTranscript()}`;

    try {
        const response = await fetch(`${amplifyChatbotSettings.apiUrl}/email-conversation/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': amplifyChatbotSettings.nonce
            },
            body: JSON.stringify({
                emailTo: email,
                subject: subject,
                body: body,
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send email conversation');
        }

        const result = await response.json();
        console.log(result);
        if (result.success) {
            emailButton.textContent = "Emailed!"; 
            toggleShowPopupMessage('Email sent successfully.', 'black');
        } else {
            toggleShowPopupMessage('Failed to send email, please try again later.', '#991a1a');
        }
      
    } catch (error) {
        console.error('Error sending email conversation:', error);
        toggleShowPopupMessage('Failed to send email, please try again later.', '#991a1a');
    }
    setTimeout(() => {
        if (document.getElementById("send-email-button")) {
            emailButton.textContent = "Submit";
            emailButton.disabled = false;
        }
    }, 800);
    
}





///////////////////  Setup   /////////////////// 

// show disclaimer and stars after we have recieved a message
async function setupDisclaimer() {
    if (disclaimer.style.display === 'none') {
        const disclaimerText = document.querySelector('.disclaimer-text');
        disclaimerText.style.display = 'inline';
        disclaimerText.innerText = botConfigData.disclaimer;
        disclaimer.style.display = 'block';
        adjustMessagesHeight();
        // adjustStarRatingPosition();
        setupStars();
        checkVisbility();
    }
}

function checkVisbility() {
    const chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    const isScrolledToBottom = chatMessagesContainer.scrollHeight - chatMessagesContainer.scrollTop <= chatMessagesContainer.clientHeight + 1;
    stars.style.visibility = isScrolledToBottom ? 'visible' : 'hidden';
}

function setupStars() {
    if (!stars.classList.contains('visible')) {
        stars.classList.add('visible');
        clearStars();
    } else {
        if (disclaimer.style.display === 'block') adjustStarRatingPositionForDisclaimer();
    }
    const chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    chatMessagesContainer.addEventListener('scroll', () => checkVisbility() );

    window.addEventListener('resize', () => {
        if (document.getElementById('starRatingPlaceholder')) { adjustStarRatingPositionForForm();
        } else {
            adjustStarRatingPositionForDisclaimer();
        }
    });
   
}

///////////////////  cleanup   /////////////////// 



function clearConversation(reinitialize = true) {
    const menuDropdown = document.getElementById('menuDropdown');
    menuDropdown.style.display = 'none';
    document.querySelector(".lwh-open-cbot .selected-group-type").textContent = '';
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    chatMessagesContainer.innerHTML = '';
    content = [];
    conversationTranscript = [];
    selectedGroupType = undefined;
    disableButton(true);
    if (reinitialize) setTimeout(() => {
        initializeData();
    }, [800])
    stars.classList.remove('visible');
    clearStars();
    conversationId = uuidv4();
}


function clearStars() {
    const inputStars = document.querySelectorAll('.star-rating input');
    inputStars.forEach(star => {
        star.checked = false;
        star.addEventListener('change', (event) => {
           const inChatPage = document.querySelector('.chat-container').style.display === 'block';
           if (inChatPage)  toggleShowSubmitFeedbackPopup(() => submitUserRating()) 
        });
    });
}

function clearForm() {
    document.querySelector('.form-container form').innerHTML = '';
}

function removeTypingAnimation() {
    let typingAnimationDivs = document.querySelectorAll('.lwh-open-cbot .typing-animation');
    typingAnimationDivs.forEach(function (typingAnimationDiv) {
        let chatMessagesAiDiv = typingAnimationDiv.closest('.chat__messages__amplify');
        if (chatMessagesAiDiv) {
            chatMessagesAiDiv.parentNode.removeChild(chatMessagesAiDiv);
        }
    });
}


function getConversationTranscript() {
    if (!conversationTranscript || conversationTranscript.length === 0) {
        return "No conversation transcript available.";
    }
    let formattedTranscript = "Conversation Transcript:\n\n";
    conversationTranscript.forEach((entry) => {
        formattedTranscript += `${entry.sender} ${entry.selectedGroupType ? `(${entry.selectedGroupType}) `: ''}[${entry.time}]:\n${entry.message}\n\n`;
    });

    return formattedTranscript.trim();
}



///////////////////  Utilities  /////////////////// 


function adjustMessagesHeight() {
    const chatMessagesContainer = document.querySelector(".lwh-open-cbot .chat__messages");
    chatMessagesContainer.style.height = `calc(100% - ${disclaimer.offsetHeight}px)`;
}

function adjustStarRatingPositionForDisclaimer() {
    stars.style.bottom = disclaimerContent.classList.contains('collapsed') ? '110px': '160px';
    stars.style.removeProperty('top');
}

function adjustStarRatingPositionForForm() {
    if (content.length < 2 && !stars.classList.contains('visible')) setupStars();
    const placeholder = document.getElementById('starRatingPlaceholder');
    const rect = placeholder.getBoundingClientRect();
    stars.style.removeProperty('bottom');
    stars.style.top = `${rect.top - 14}px`;
    

}


function disableButton(disabled) {
    button.disabled = disabled;
}


function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}





///////////////////  HTML Components  /////////////////// 

function amplifyTyping() {
    return `<div><img width="50px" class="bot-image" src="${botConfigData.avatar}" alt="amplify" key="${new Date().getTime()}"></div><div class="message"><svg height="16" width="40" style="max-height: 20px;"><circle class="dot" cx="10" cy="8" r="3" style="fill:grey;" /><circle class="dot" cx="20" cy="8" r="3" style="fill:grey;" /><circle class="dot" cx="30" cy="8" r="3" style="fill:grey;" /></svg></div>`;
}

function formTitle(title) {
    return `<h1 class="title">${title}</h1>`;
} 

// function nameFormGroup() {
//     return `<div class="form-group position-relative">
//                 <i class="icon fa-regular fa-user"></i> 
//                 <input type="text" id="formName" class="form-control thick" placeholder="Name">
//             </div>`;
// }

function emailFormGroup() {
    return `<div class="form-group position-relative">
                <i class="icon fa-regular fa-envelope"></i> 
                <input type="email" id="formEmail" class="form-control thick" placeholder="E-mail" value="${amplifyChatbotSettings.userEmail}">
            </div>`;
}

amplifyChatbotSettings.userEmail

function messageFormGroup(placeholder) {
    return ` <div class="form-group message">
                <textarea id="formMessage" class="form-control" rows="7" placeholder="${placeholder}"></textarea>
            </div> `;
} 


function submitButton(buttonId) {
    return `<div class="text-center">
                <button id="${buttonId}" class="submit-form">Submit</button>
            </div> `;
}

