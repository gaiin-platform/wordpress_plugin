<?php

///////////////////  Requests  /////////////////// 

function handle_submit_rating_request( WP_REST_Request $request ) {
    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    if (!is_config_loaded($config, ['assistant_endpoint', 'amplify_api_key'])) {
        return new WP_Error('missing_params', 'Required params include assistant_endpoint, amplify_api_key', array('status' => 400));
    }

    $assistant_api_url = $config['assistant_endpoint'] . "/assistant/save_user_rating"; 
    
    $access_token = $config['amplify_api_key'];

    $conversation_id = $request->get_param('conversationId');
    $rating = $request->get_param('userRating');
    $feedback = $request->get_param('feedback') ?? '';



    if (empty($conversation_id) || empty($rating)) {
        return new WP_Error('missing_params', 'Both conversationId and userRating are required', array('status' => 400));
    }

    $body = json_encode(
        array( 'data' => array(
            'conversationId' => $conversation_id,
            'userRating' => $rating,
            'userFeedback' => $feedback
        )
        ));

    // error_log(print_r($body, true));


    $args = array(
        'headers' => array(
            'Authorization' => 'Bearer ' . $access_token,
            'Content-Type' => 'application/json',
        ),
        'body' => $body,
        'method' => 'POST',
    );


    $response = wp_remote_post($assistant_api_url, $args);
    if (is_wp_error($response)) {
        return new WP_Error('request_failed', 'The API request failed', array('status' => 500));
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        return new WP_Error('json_decode_error', 'Failed to decode JSON response', array('status' => 500));
    }

    $status_code = isset($data['statusCode']) ? $data['statusCode'] : 500;
    if ($status_code !== 200) {
        return new WP_Error('api_error', 'Failed to save user rating', array('status' => $status_code));
    } else {
        return rest_ensure_response(array(
        'success' => true,
    ));
    }

    
}


function handle_follow_up_request( WP_REST_Request $request ) {
    error_log("Handle following up");
    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    if (!is_config_loaded($config, ['email_to'])) {
        return new WP_Error('missing_params', 'Required params email_to missing', array('status' => 400));
    }


    $email_subject = $request->get_param('subject');
    $email_body = $request->get_param('body');

    if (empty($email_subject) || empty($email_body)) {
        return new WP_Error('missing_params', 'Missing data', array('status' => 400));
    }

    return handle_send_email( $config['email_to'], $email_subject, $email_body );
}


function handle_email_conversation_request( WP_REST_Request $request ) {
    error_log("handle_email");

    $email_to = $request->get_param('emailTo');
    $email_subject = $request->get_param('subject');
    $email_body = $request->get_param('body');
    
    if (empty($email_body) || empty($email_subject) || empty($email_to)) {
        return new WP_Error('missing_params', 'Missing data', array('status' => 400));
    }

    return handle_send_email( $email_to,  $email_subject, $email_body); 
}



function handle_send_email($email_to, $email_subject, $email_body) {
    error_log("send_email");

    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    if (!is_config_loaded($config, ['base_api_endpoint', 'amplify_api_key'])) {
        return new WP_Error('missing_params', 'Required params include base_api_endpoint, amplify_api_key', array('status' => 400));
    }

    $api_url = $config['base_api_endpoint'] . "/ses/send-email"; 
    $access_token = $config['amplify_api_key'];

    $body = json_encode(array(
        "data" => array(
            "email_to" => $email_to,
            "email_subject" => $email_subject,
            "email_body" => $email_body
        )
    ));

    $args = array(
        'headers' => array(
            'Authorization' => 'Bearer ' . $access_token,
            'Content-Type' => 'application/json',
        ),
        'body' => $body,
        'method' => 'POST',
    );

    $response = wp_remote_post($api_url, $args);
    if (is_wp_error($response)) {
        return new WP_Error('request_failed', 'The API request failed', array('status' => 500));
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    
    if (json_last_error() !== JSON_ERROR_NONE) {
        return new WP_Error('json_decode_error', 'Failed to decode JSON response', array('status' => 500));
    }

    // Assuming backend response is a simple true or false
    if (isset($data['success']) && $data['success']) {
        return rest_ensure_response(array(
            'success' => true,
            'message' => 'Email sent successfully.'
        ));
    } else {
        return new WP_Error('api_error', 'Failed to send email', array('status' => 400));
    }
}

///////////////////  Chat Request  /////////////////// 


function handle_chat_bot_request( WP_REST_Request $request ) {
    if (function_exists('apache_setenv')) {
        apache_setenv('no-gzip', '1');
        apache_setenv('dont-vary', '1');
    }
    
    ini_set('output_buffering', 'off');
    ini_set('zlib.output_compression', 'off');

    // header('Content-Type: text/event-stream');
    // header('Cache-Control: no-cache');
    // header('Connection: keep-alive');

   
    if (ob_get_level()) {
        ob_end_clean();
    }


    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    
    if (!is_config_loaded($config, ['chat_endpoint', 'amplify_api_key'])) {
        return new WP_Error('config_error', "Configuration values chat_endpoint', 'amplify_api_key are missing or not set correctly.");
    }

    $api_url = $config['chat_endpoint']; 
    $access_token = $config['amplify_api_key'];

    $conversation_history = $request->get_param('conversation_history');
    $conversation_id = $request->get_param('conversation_id');
    $assistant_name = $request->get_param('assistant_name');
    $model = $request->get_param('model') ??  $config['default_model'];
    $prompt = $request->get_param('prompt') || '';
    $group_id = $request->get_param('group_id');
    $group_type = $request->get_param('group_type');
    $num_prompts = $request->get_param('num_prompts');
    $user =  $request->get_param('user');
    

    if (!is_array($conversation_history)) {
        return new WP_Error('conversation_history_error', "Conversation history in not an array");
    }
    
    $payload = array(
        "model" => $model,
        "temperature" => 0.5,
        "max_tokens" => 500,
        "dataSources" => [],
        "messages" =>  $conversation_history,
        "options" => array(
            "ragOnly" => true,
            "skipRag" => false,
            "model" => array("id" => $model),
            "prompt" => $prompt,
            "source" => 'wordpress',
            "assistantId" =>  $config['astgp'],
            "assistantName" =>  $assistant_name,
            "groupId"  => $group_id,
            "groupType" => $group_type,
            "conversationId" => $conversation_id,
            "numPrompts" => $num_prompts,
            "user" => $user
        )
    );

    
    // error_log('Chat payload ' . print_r($payload, true));

    $result = stream_chat_response($config['chat_endpoint'], $config['amplify_api_key'], $payload);

    if (is_wp_error($result)) {
        error_log(print_r(get_error_message), true);
        echo "event: error\n";
        echo 'data: ' . json_encode(['error' => $result->get_error_message()]) . "\n\n";
        ob_flush();
        flush();
        return;
    }
    ob_flush();
    flush();

    // End the request, nothing more to send
    exit();
}


function stream_chat_response($api_url, $access_token, $payload) {
    // Initialize cURL session
    $ch = curl_init($api_url);

    // Set cURL options
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Authorization: Bearer ' . $access_token,
        'Content-Type: application/json'
    ));

    
    curl_setopt($ch, CURLOPT_BUFFERSIZE, 64);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);  
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) {
       
        $lines = explode("\n", $data);
        foreach ($lines as $line) {
            if (empty($line)) continue; 
            $jsonString = trim(preg_replace('/^data:\s*/', '', $line));
            // Decode the JSON string
            $parsedData = json_decode($jsonString, true);

            if (isset($parsedData['d']) && is_string($parsedData['d'])) {
                echo json_encode(['message' => $parsedData['d']]) . "\n\n";
                ob_flush();
                flush();  
                
            }
        }
        return strlen($data); 
    });
    curl_setopt($ch, CURLOPT_TIMEOUT, 0);  // No timeout for long-running streams

    // Execute the request
    curl_exec($ch);

    // Check for any cURL errors
    if (curl_errno($ch)) {
        return new WP_Error('api_error', curl_error($ch));
    }

    // Close the cURL session
    curl_close($ch);

    return true;
}




// function handle_post_request( WP_REST_Request $request ) {
//     error_log('ENTER HANDLE POST REUQEST ');
//     // Extract data from the POST request
//     $conversation_history = $request->get_param('conversation_history');
//     $conversation_id = $request->get_param('conversation_id');
//     $model = $request->get_param('model');
//     $prompt = $request->get_param('prompt');
//     $group_id = $request->get_param('group_id');
//     $group_type = $request->get_param('group_type');
//     $num_prompts = $request->get_param('num_prompts');
//     $assistant_name = $request->get_param('assistant_name');

//     // Validate the conversation history
//     if (!is_array($conversation_history)) {
//         return new WP_Error('conversation_history_error', "Conversation history is not an array");
//     }

//     // Store all required data using transient
//     $transient_key = 'conversation_' . $conversation_id;
//     $conversation_data = [
//         'conversation_history' => $conversation_history,
//         'model' => $model,
//         'prompt' => $prompt,
//         'group_id' => $group_id,
//         'group_type' => $group_type,
//         'num_prompts' => $num_prompts,
//         'assistant_name' => $assistant_name
//     ];

//     error_log('setting transient ');

//     // Set the transient for 1 hour (3600 seconds)
//     set_transient($transient_key, $conversation_data, 3600);

//     return new WP_REST_Response(['status' => 'Message received and stored']);
// }




// function handle_chat_bot_request( WP_REST_Request $request ) {
//     // Set headers for SSE.
//     header('Content-Type: text/event-stream');
//     header('Cache-Control: no-cache');
//     header('Connection: keep-alive');
//     header('X-Accel-Buffering: no');
//     header("Access-Control-Allow-Origin: *");

//     if (function_exists('apache_setenv')) {
//         apache_setenv('no-gzip', '1');
//         apache_setenv('dont-vary', '1');
//     }

//     ini_set('output_buffering', 'off');
//     ini_set('zlib.output_compression', 'off');

//     if (ob_get_level()) ob_end_clean();

//     ob_flush();
//     flush();




//     echo "event: open\n";
//     echo "data: connection opened\n\n";
//     ob_flush();
//     flush();


//     // Retrieve conversation data using the transient key
//     $conversation_id = $request->get_param('conversation_id');
//     $transient_key = 'conversation_' . $conversation_id;
//     $conversation_data = get_transient($transient_key);

//     if (!$conversation_data) {
//         error_log('No conversation found for ID: ' . $conversation_id);
//         echo "data: " . json_encode(['message' => 'No conversation found']) . "\n\n";
//         ob_flush();
//         flush();
//         error_log("Error closing now");
//         // End stream
//         echo "event: close\n";
//         echo "data: connection closed\n\n";
//         ob_flush();
//         flush();
//         exit();
//     }

//     // Retrieve conversation data and proceed with API call
//     $conversation_history = $conversation_data['conversation_history'];
//     $model = $conversation_data['model'];
//     $prompt = $conversation_data['prompt'];
//     $group_id = $conversation_data['group_id'];
//     $group_type = $conversation_data['group_type'];
//     $num_prompts = $conversation_data['num_prompts'];
//     $assistant_name = $conversation_data['assistant_name'];

//     $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
//     $api_url = $config['chat_endpoint']; 
//     $access_token = $config['amplify_api_key'];

//     $payload = array(
//         "model" => $model,
//         "temperature" => 0.5,
//         "max_tokens" => 500,
//         "dataSources" => [],
//         "messages" =>  $conversation_history,
//         "options" => array(
//             "ragOnly" => true,
//             "skipRag" => false,
//             "model" => array("id" => $model),
//             "prompt" => $prompt,
//             "source" => 'wordpress',
//             "assistantId" => $config['astgp'],
//             "assistantName" => $assistant_name,
//             "groupId" => $group_id,
//             "groupType" => $group_type,
//             "conversationId" => $conversation_id,
//             "numPrompts" => $num_prompts
//         )
//     );

//     // Stream chat response
//     $result = stream_chat_response($api_url, $access_token, $payload);

//     if (is_wp_error($result)) {
//         error_log(print_r(get_error_message(), true));
//         echo "event: error\n";
//         echo 'data: ' . json_encode(['error' => $result->get_error_message()]) . "\n\n";
//         ob_flush();
//         flush();
//         exit();
//     }



//     // echo ":ping\n\n";  // Comment to force the browser to maintain the connection
//     // ob_flush();
//     // flush();


//     // not working 
//     echo "event: close\n";
//     echo "data: connection closed\n\n";
//     ob_flush();
//     flush();

//     //so manually closing:
//     echo "data: " . json_encode(['message' => "CLOSE_CONNECTION"]) . "\n\n";
//     ob_flush();
//     flush();

//     // Clean up transient (optional)
//     delete_transient($transient_key);
//     http_response_code(204);
//     exit();
// }



// function stream_chat_response($api_url, $access_token, $payload) {
//     // Initialize cURL session
//     $ch = curl_init($api_url);

//     // Set cURL options for streaming
//     curl_setopt($ch, CURLOPT_HTTPHEADER, array(
//         'Authorization: Bearer ' . $access_token,
//         'Content-Type: application/json'
//     ));
//     curl_setopt($ch, CURLOPT_POST, true);
//     curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
//     curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); // Ensure streaming mode
//     curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) {
//         // Process the data stream chunk by chunk
//         $lines = explode("\n", $data);
//         foreach ($lines as $line) {
//             if (empty($line)) continue;
//             $jsonString = trim(preg_replace('/^data:\s*/', '', $line));
//             $parsedData = json_decode($jsonString, true);

//             // Stream each chunk to the client
//             if (isset($parsedData['d']) && is_string($parsedData['d'])) {
//                 echo "data: " . json_encode(['message' => $parsedData['d']]) . "\n\n";
//                 ob_flush();
//                 flush();
//             }
//         }
//         return strlen($data);
//     });

//     curl_setopt($ch, CURLOPT_TIMEOUT, 0);  // No timeout for long-running streams

//     // Execute the request
//     curl_exec($ch);

//     // Check for cURL errors
//     if (curl_errno($ch)) {
//         return new WP_Error('api_error', curl_error($ch));
//     }

//     error_log("Closing now");
//     // End stream
//     echo "event: close\n";
//     echo "data: connection closed\n\n";
//     ob_flush();
//     flush();

//     // Close the cURL session
//     curl_close($ch);
//     return true;
// }

