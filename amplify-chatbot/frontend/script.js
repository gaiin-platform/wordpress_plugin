const apiUrl = amplifyChatbotSettings.apiUrl;
const AMPLIFY = "amplify";
const USER = "user";
const ASSISTANT = 'assistant';
const FAIL_MESSAGE = 'We are unable to reach Amplify at this time, please refresh the page and try again.';
let content = [];
let conversationTranscript = [];
let botConfigData = {};
let disclaimer = null;
let stars = null;
let selectedGroupType = undefined;
let canStartChatting = false;
let isInitialized = false;
let conversationId = uuidv4();
let feedbackSubmitted = false;
let messageBuffer = '';

const dataSourceMap = {};


///////////////////  On Load  /////////////////// 
document.addEventListener('DOMContentLoaded', function () {
    document.querySelector('.chat__title').textContent = amplifyChatbotSettings.assistantName;
    const button = document.querySelector('.lwh-open-cbot #submit-btn');
    button.disabled = true;
    fetchBotConfiguration();
    
    const messageInput = document.querySelector('.lwh-open-cbot #message');
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
            addUserChatMessage(userMessage);
            messageInput.value = '';  // Clear the input field
            // Fetch data with assistant response streaming
            fetchChatData();
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

    // used through out 
    disclaimer = document.querySelector('.disclaimer');
    stars = document.querySelector('.star-rating');

});



///////////////////  On Load Configuration  /////////////////// 
async function fetchBotConfiguration() {
    const chatMessagesContainer = document.querySelector(".lwh-open-cbot .chat__messages");
    document.querySelector(".lwh-open-cbot .loading").style.display = 'flex';
    chatMessagesContainer.innerHTML = '';
    let botResponse = ''
    try {
        botResponse = await fetch(amplifyChatbotSettings.botConfigurationUrl);
        if (botResponse.ok) { 

            botConfigData = await botResponse.json();

            // console.log("API Response:", botConfigData); // Check what the API returned

            if (!botConfigData) {
                throw new Error('Invalid configuration data');
            }

            const astTitle = document.querySelector('.lwh-open-cbot .chat__title');
            if (!astTitle.textContent) astTitle.textContent = botConfigData.assistantName;

            chatMessagesContainer.style.fontSize = `${botConfigData.fontSize}px`;

            // remove loading display
            document.querySelector(".lwh-open-cbot .loading").style.display = 'none';
            document.querySelector(".lwh-open-cbot .chat__status").innerHTML = `<span></span> Online`;
            document.querySelector(".lwh-open-cbot .chat__status").querySelector("span").style.background = "#68D391";

            const isOpen = document.querySelector(".lwh-open-cbot .chat").classList.contains('show');

            if (isOpen && !isInitialized) {
                initializeData();
            }

            chatMessagesContainer.addEventListener('click', event => {
                if (event.target.matches('a[href^="#dataSource:"]')) {
                    event.preventDefault();
                    let link = event.target;
                    document.body.style.cursor = 'wait';
                    let dataSource = link.getAttribute('href').substring('#dataSource:'.length).trim();
                    dataSource = decodeURIComponent(dataSource);

                    // Normalize curly quotes to standard quotes
                    dataSource = dataSource.replace(/\//g, '&');
                    if (dataSourceMap.hasOwnProperty(dataSource)) {
                        let presignedUrl = dataSourceMap[dataSource];
                        window.open(presignedUrl, '_blank','noopener,noreferrer');
                        
                    } else {
                        link.style.color = 'black';
                        toggleShowPopupMessage("Unfortunately, we are unable to provide you with the document at this time.");
                    }
                    setTimeout(() => {document.body.style.cursor = 'default'}, 200);
                }
            });

            marked.setOptions({
                breaks: false, 
                smartypants: true 
              });

        } else {
            document.querySelector(".lwh-open-cbot .loading").style.display = 'none';
            toggleShowPopupMessage(FAIL_MESSAGE);
            throw new Error("Request failed. Please try again! " + botResponse.status);
        }
    } catch (error) {
        console.log(error);
        toggleShowPopupMessage(FAIL_MESSAGE);
        return;
    }
}

/////////////////// On Load Messages /////////////////// 

async function initializeData() {
    isInitialized = true;
    // starter message 
    if (botConfigData.startUpMessage) {
        await addChatTypingAnimation(botConfigData.startUpMessage, false, 100, 800);
        conversationTranscript.push({
            sender: AMPLIFY,
            time: new Date().toLocaleString(),
            message: botConfigData.startUpMessage,
        });
    }

    if (botConfigData.groupTypes && Object.keys(botConfigData.groupTypes).length > 0) {
        const groupQuestion = botConfigData.groupTypeQuestions;
        await addChatTypingAnimation(groupQuestion, false, 110, 600);
        displayGroupTypes(botConfigData.groupTypes);
        conversationTranscript.push({
            sender: AMPLIFY,
            time: new Date().toLocaleString(),
            message: groupQuestion,
        });
    } else {
        disableButton(false);
        canStartChatting = true; // No group types to select
    }
}

function displayGroupTypes(groupTypes) {
    const chatMessagesContainer = document.querySelector(".lwh-open-cbot .chat__messages");
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

                typesContainer.parentNode.insertBefore(disabledContainer, typesContainer.nextSibling);

            } else {
                disableButton(false);
                canStartChatting = true;
            }
        };
        typesContainer.appendChild(typeButton);
    });
}

function clearDisabledMessage() {
    let existingContainer = document.querySelector(".lwh-open-cbot .disabled-container");
    if (existingContainer) existingContainer.remove();
}



///////////////////  Add Messages to Conversation  /////////////////// 

function addUserChatMessage(message) {
    content.push({
        role: USER,
        message: message,
    });
    conversationTranscript.push({
        sender: USER,
        time: new Date().toLocaleString(),
        message: message,
        selectedGroupType: selectedGroupType
    });
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    let messageContainer = document.createElement('div');
    messageContainer.classList.add('chat__messages__' + USER);
    let messageDiv = document.createElement('div');
    messageDiv.innerHTML = ` <p>${message} </p> `;
    messageContainer.appendChild(messageDiv);
    chatMessagesContainer.appendChild(messageContainer);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

async function addChatTypingAnimation(typingMessage = null, continueAnimation=true, typingSpeed=150, loadingTime=2500) {
    messageBuffer = ''; // clear the buffer here since this is the start of a new message

    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');

    // Create the typing container for the message
    let typingContainer = document.createElement('div');
    typingContainer.classList.add('chat__messages__' + AMPLIFY);

    // Create the bot image
    typingContainer.appendChild( avatar() );

    let container = document.createElement('div');
    container.classList.add('typing-container');

    let messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    container.appendChild(messageDiv);

    // Create the typing animation SVG initially
    let typingAnimationDiv = document.createElement('div');
    typingAnimationDiv.classList.add('typing-animation');
    typingAnimationDiv.innerHTML = typingDots;
    messageDiv.appendChild(typingAnimationDiv);

    typingContainer.appendChild(container);
    chatMessagesContainer.appendChild(typingContainer);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    // Show the typing animation for 1000ms
    await new Promise(resolve => setTimeout(resolve, loadingTime));

    if (typingMessage) {
        let typingMessageSpan = document.createElement('span');
        messageDiv.appendChild(typingMessageSpan);

        let words = typingMessage.split(' ');
        let currentWordIndex = 0;

        typingAnimationDiv.remove();

        // Function to type words one by one
        async function displayNextWord() {
            return new Promise((resolve) => {
                function typeWord() {
                    if (currentWordIndex < words.length) {
                        typingMessageSpan.textContent += (currentWordIndex > 0 ? ' ' : '') + words[currentWordIndex];
                        currentWordIndex++;
                        setTimeout(typeWord, typingSpeed); // Delay between words
                    } else {
                        resolve(); // Resolve once all words are typed
                    }
                }
                typeWord();
            });
        }

        // Wait for the entire typing message to complete
        await displayNextWord();



        if (continueAnimation) setTimeout(() => {
                                    messageDiv.innerHTML = '';
                                    messageDiv.appendChild(typingAnimationDiv); 
                                }, 1250);
    }

    return new Promise(resolve => {
        resolve(); 
    });
}



function replaceTypingAnimationWithMessage(messageChunk) {
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');

    let typingContainer = document.querySelector(`.lwh-open-cbot .chat__messages__${AMPLIFY}:last-child`);
    if (typingContainer) {

        let messageDiv = typingContainer.querySelector('.message');
        if (messageDiv) {
            let typingSVG = messageDiv.querySelector('svg');
            if (typingSVG) {
                typingSVG.remove();
            }
            messageBuffer += messageChunk;
            let sanitizedMarkdown = convertUrlsToLinks(messageBuffer);

            let parsedChunk;
            try {
                parsedChunk = marked.parse(sanitizedMarkdown);
                parsedChunk = addBlankTargetAndRelToLinks(parsedChunk);
            } catch (error) {
                console.error('Error parsing markdown:', error);
                parsedChunk = sanitizedMarkdown; // Fallback to sanitized text
            }
            messageDiv.innerHTML = parsedChunk;
        } else {
            console.error('messageDiv not found in typingContainer', typingContainer);
        }

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
}


function removeTypingAnimationChat() {
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    if (chatMessagesContainer.lastChild && chatMessagesContainer.lastChild.classList.contains('chat__messages__' + AMPLIFY)) {
        chatMessagesContainer.removeChild(chatMessagesContainer.lastChild);
    }
}

async function addRegenerateButton() {
    removeTypingAnimationChat()
    await addChatTypingAnimation(botConfigData.retryMessage, false, 100, 0);
    let chatMessagesContainer = document.querySelector('.lwh-open-cbot .chat__messages');
    let typingContainer = chatMessagesContainer.querySelector('.chat__messages__' + AMPLIFY + ':last-child');

    if (typingContainer) {
        let regenerateButton = document.createElement('button');
        regenerateButton.classList.add('regenerate-button');
        regenerateButton.setAttribute('title', `Resend message to ${botConfigData.assistantName}`); 
    
        let icon = document.createElement('i');
        icon.classList.add('fas', 'fa-sync'); 
    
        regenerateButton.appendChild(icon);
        regenerateButton.appendChild(document.createTextNode('Retry'));
        typingContainer.appendChild(regenerateButton);  
        regenerateButton.addEventListener('click', async function (event) {
            event.preventDefault();
            removeTypingAnimationChat();
            fetchChatData();
        });
    }
}


///////////////////  Requests  /////////////////// 

async function fetchChatData() {
    disableButton(true);
    const controller = new AbortController(); // Create a new AbortController 180000
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        addChatTypingAnimation(botConfigData.typingMessage);

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
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

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
                        const jsonResponse = JSON.parse(line);
                        if (jsonResponse.dataSources) {
                            getPresignedUrls(jsonResponse.dataSources);
                        } else if (jsonResponse.message) {
                            const messageChunk = jsonResponse.message;
                            assistantMessage += messageChunk;
                            replaceTypingAnimationWithMessage(messageChunk);
                        }
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
            toggleShowPopupMessage(FAIL_MESSAGE);
            throw new Error("Request failed. Please try again!");
        }


    } catch (error) {
        clearTimeout(timeoutId);
        // toggleShowPopupMessage(FAIL_MESSAGE);
        if (error.name === 'AbortError') {
            console.error('Fetch aborted due to timeout:', error);
            // Handle the timeout-specific logic here
        } else {
            console.error('There was a problem with the fetch operation:', error);
        }
        addRegenerateButton();
        return;
    }
}


async function fetchPresignedUrl(dataSource, key) {
    // console.log("dataSource:" , dataSource)
    try {
        const response = await fetch(apiUrl + '/fetch-presigned-url/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-WP-Nonce': amplifyChatbotSettings.nonce
            },
            body: JSON.stringify({
                key: key,
                group_id: botConfigData.groupId
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch presigned URL');
        }

        const result = await response.json();
        if (result.success && result.downloadUrl) {
            // Add to dataSourceMap
            dataSourceMap[dataSource] = result.downloadUrl;
        } else {
            console.error('Failed to fetch presigned URL:', result.message || 'Unknown error');
        }
    } catch (error) {
        console.error('Error fetching presigned URL:', error);
    }
}



async function submitUserRating() {
    const inChatPage = document.querySelector('.chat-container').style.display === 'block';

    const rating = document.querySelector('.star-rating input[name="stars"]:checked');
    const ratingValue = rating ? rating.id.replace('star', '') : '';

    if (!ratingValue) {
        stars.classList.add('error-shake');
        toggleShowPopupMessage("Please enter a Star rating.");
        stars.addEventListener('animationend', () => {
            stars.classList.remove('error-shake');
        }, {once: true});
        return;
    }
    feedbackSubmitted = true;
    const feedbackButton = document.getElementById("submit-feedback-button");
    if (feedbackButton) {
        feedbackButton.textContent = "Sending...";  
        feedbackButton.disabled = true;
    }

    try {

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
            if (feedbackButton) feedbackButton.textContent = "Thanks!"; 
           
            if (!inChatPage) toggleShowPopupMessage('Feedback submitted successfully.', 'black');
        } else {
            feedbackSubmitted = false;
            if (!inChatPage) toggleShowPopupMessage('Failed to submit rating, please try again later.');
        }
    } catch (error) {
        feedbackSubmitted = false;
        console.error('Error submitting rating:', error);
        toggleShowPopupMessage('Failed to submit rating, please try again later.'); 
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
    // required email
    

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
            toggleShowPopupMessage('Failed to submit follow-up request, please try again later.');
        }
        
    } catch (error) {
        console.error('Error submitting follow-up request:', error);
        toggleShowPopupMessage('Failed to submit follow-up request, please try again later.');
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

    // required email 

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
                subject: subject ? subject : `${botConfigData.assistantName} Conversation Transcript - Amplify`,
                body: body,
            })
        });

        if (!response.ok) {
            throw new Error('Failed to send email conversation');
        }

        const result = await response.json();
        if (result.success) {
            emailButton.textContent = "Emailed!"; 
            toggleShowPopupMessage('Email sent successfully.', 'black');
        } else {
            toggleShowPopupMessage('Failed to send email, please try again later.');
        }
      
    } catch (error) {
        console.error('Error sending email conversation:', error);
        toggleShowPopupMessage('Failed to send email, please try again later.');
    }
    setTimeout(() => {
        if (document.getElementById("send-email-button")) {
            emailButton.textContent = "Submit";
            emailButton.disabled = false;
        }
    }, 800);
    
}





///////////////////  Setup   /////////////////// 

async function getPresignedUrls(dataSources) {
    let seen = [];
    for (let key in dataSources) {
        let dataSourceMapKey = key.replace(/ /g, '&');
        
        // Check if the dataSourceMapKey already exists in dataSourceMap
        if (dataSourceMap.hasOwnProperty(dataSourceMapKey) || seen.includes(dataSourceMapKey)) {
            continue; // Skip if already present
        }
        
        let contentKey = dataSources[key];
        
        try {
            seen.push(dataSourceMapKey);
            // Fetch the presigned URL using contentKey
            fetchPresignedUrl(dataSourceMapKey, contentKey);
            // If presignedUrl is null or undefined, do not add to dataSourceMap
        } catch (error) {
            console.error(`Error fetching presigned URL for ${contentKey}:`, error);
        }
    }
}

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
    stars.style.visibility = isScrolledToBottom && !document.querySelector('.lwh-open-cbot #submit-btn').disabled ? 'visible' : 'hidden';
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



///////////////////  Toggle Components  /////////////////// 


function toggleShowChatUI() {
    if (!toggleShowSubmitFeedbackPopup(() => continueChatUI())) {
        continueChatUI();
    }
}


function continueChatUI() {
    const chatWindow = document.querySelector(".lwh-open-cbot .chat");
    const chatIcon = document.querySelector('.vanderbilt-chat-icon');
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
            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 2px;">
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





function toggleShowPopupMessage(val, color='#991a1a') {
    const popup = document.querySelector('.lwh-open-cbot .popup');
    popup.classList.remove('popup-animation-static');
    popup.innerHTML = '<p></p>'; 
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
    const disclaimerContent = document.querySelector('.disclaimer-content');
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
            document.getElementById("submit-followup-button").addEventListener('click', () => validateRequiredFields(submitFollowUp));
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
            document.getElementById("send-email-button").addEventListener('click', () => validateRequiredFields(sendEmailConversation));

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
    feedbackSubmitted = false;
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
           if (inChatPage)  {
            feedbackSubmitted = false; // in case they update the rating and dont want to submit feedback
            toggleShowSubmitFeedbackPopup(() => submitUserRating());
            
           }

        });
    });
}

function clearForm() {
    document.querySelector('.form-container form').innerHTML = '';
}


function getConversationTranscript() {
    if (!conversationTranscript || conversationTranscript.length === 0) {
        return "No conversation transcript available.";
    }
    let formattedTranscript = "Conversation Transcript:\n\n";
    conversationTranscript.forEach((entry) => {
        entry.message = entry.message.replace(/\[([^\]]+)\]\(#dataSource:[^\)]+\)/g, '[$1]');
        const sender = entry.sender === AMPLIFY ? amplifyChatbotSettings.assistantName : "User";
        formattedTranscript += `${sender} ${entry.selectedGroupType ? `(${entry.selectedGroupType}) `: ''}[${entry.time}]:\n${entry.message}\n\n`;
    });

    return formattedTranscript.trim();
}



///////////////////  Utilities  /////////////////// 


function adjustMessagesHeight() {
    const chatMessagesContainer = document.querySelector(".lwh-open-cbot .chat__messages");
    chatMessagesContainer.style.height = `calc(100% - ${disclaimer.offsetHeight}px)`;
}

function adjustStarRatingPositionForDisclaimer() {
    const disclaimerContent = document.querySelector('.disclaimer-content');
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
    const button = document.querySelector('.lwh-open-cbot #submit-btn');
    button.disabled = disabled;
}


function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


const purifyConfig = {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel|#dataSource):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
};

function convertUrlsToLinks(text) {
    let urlRegex = /(https?:\/\/[^\s]+)/g;
    return DOMPurify.sanitize(
        text.replace(urlRegex, function (url) {
            return `[${url}](${url})`;
        }),
        purifyConfig
    );
}

function addBlankTargetAndRelToLinks(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    doc.querySelectorAll('a').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });
    const sanitizedHTML = DOMPurify.sanitize(doc.body.innerHTML, purifyConfig);
    return sanitizedHTML;
}

function validateRequiredFields(onSubmit) {
    const emailForm = document.getElementById('formEmail');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailForm.value || !emailPattern.test(emailForm.value)) {
        // Email field is empty
        emailForm.classList.add('error-shake');
        toggleShowPopupMessage("Please enter a valid email address.");
        emailForm.addEventListener('animationend', () => {
            emailForm.classList.remove('error-shake');
        }, {once: true});
       
    }  else {
        // Email is valid, proceed with submission
        onSubmit();
    }
}



///////////////////  HTML Components  /////////////////// 

const typingDots = `<svg height="16" width="40" style="max-height: 20px;">
            <circle class="dot" cx="10" cy="8" r="3" style="fill:grey;" />
            <circle class="dot" cx="20" cy="8" r="3" style="fill:grey;" />
            <circle class="dot" cx="30" cy="8" r="3" style="fill:grey;" />
        </svg>`;




function formTitle(title) {
    return `<div class="title">${title}</div>`;
} 

// function nameFormGroup() {
//     return `<div class="form-group position-relative">
//                 <i class="icon fa-regular fa-user"></i> 
//                 <input type="text" id="formName" class="form-control thick" placeholder="Name">
//             </div>`;
// }

function emailFormGroup() {
    return `<div class="form-group position-relative">
                <i class="icon fa-regular fa-envelope" style="font-style: normal !important;"></i> 
                <input type="email" id="formEmail" class="form-control thick" placeholder="E-mail" value="${amplifyChatbotSettings.userEmail}">
            </div>`;
}


function messageFormGroup(placeholder) {
    return ` <div class="form-group message">
                <textarea id="formMessage" class="form-control" rows="7" placeholder="${placeholder}"></textarea>
            </div> `;
} 


function submitButton(buttonId) {
    return `<div class="text-center">
                <button type="button" id="${buttonId}" class="submit-form">Submit</button>
            </div> `;
}



function avatar() {
    let botImageDiv = document.createElement('div');
    botImageDiv.style.display = 'inline-flex'; 
    botImageDiv.style.flexShrink = '0';
    botImageDiv.style.flexGrow = '0';
    // botImageDiv.style.width = '45px';
    // botImageDiv.style.height = '54px';
    botImageDiv.innerHTML = `<img class="bot-image" src="${botConfigData.avatar}"  style=" flex-shrink: 0 !important; flex-grow: 0 !important; width: 56px !important; height: auto !important; " alt="amplify" alt="amplify">`;
    return botImageDiv;
}
