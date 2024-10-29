<?php




///////////////////  Requests  /////////////////// 

function handle_fetch_presigned_url_request( WP_REST_Request $request ) {
    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    // error_log("Fetching presigned url ");
    // Ensure required configurations are loaded
    if (!is_config_loaded($config, ['base_api_endpoint', 'amplify_api_key'])) {
        return new WP_Error('missing_params', 'Required params include base_api_endpoint, amplify_api_key', array('status' => 400));
    }

    $api_url = $config['base_api_endpoint'] . "/files/download";  
    $access_token = $config['amplify_api_key'];

    // Get parameters from the request
    $key = $request->get_param('key');
    $group_id = $request->get_param('group_id');

    if (empty($key) || empty($group_id)) {
        return new WP_Error('missing_params', 'Both key and group_id are required', array('status' => 400));
    }

    // Prepare the body of the request
    $body = json_encode(
        array(
            'data' => array(
                'key' => $key,
                'groupId' => $group_id,
            )
        )
    );

    // Set up the request arguments
    $args = array(
        'headers' => array(
            'Authorization' => 'Bearer ' . $access_token,
            'Content-Type'  => 'application/json',
        ),
        'body'    => $body,
        'method'  => 'POST',
    );

    // Make the API request
    $response = wp_remote_post($api_url, $args);
    // error_log(print_r($response, true));

    if (is_wp_error($response)) {
        return new WP_Error('request_failed', 'The API request failed', array('status' => 500));
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        return new WP_Error('json_decode_error', 'Failed to decode JSON response', array('status' => 500));
    }

    if (isset($data['success']) && $data['success'] === true && isset($data['downloadUrl'])) {
        return rest_ensure_response(array(
            'success'     => true,
            'downloadUrl' => $data['downloadUrl'],
        ));
    } else {
        $message = isset($data['message']) ? $data['message'] : 'Failed to fetch presigned URL';
        return new WP_Error('api_error', $message, array('status' => 500));
    }
}


function handle_submit_rating_request( WP_REST_Request $request ) {
    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    if (!is_config_loaded($config, ['base_api_endpoint', 'amplify_api_key'])) {
        return new WP_Error('missing_params', 'Required params include base_api_endpoint, amplify_api_key', array('status' => 400));
    }

    $assistant_api_url = $config['base_api_endpoint'] . "/assistant/save_user_rating"; 
    
    $access_token = $config['amplify_api_key'];

    $conversation_id = $request->get_param('conversationId');
    $rating = $request->get_param('userRating');
    $feedback = $request->get_param('userFeedback');

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

    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
   
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
        "max_tokens" => 4000,
        "dataSources" => [],
        "messages" =>  $conversation_history,
        "options" => array(
            "ragOnly" => true,
            "skipRag" => false,
            "model" => array("id" => $model),
            "prompt" => $prompt,
            "source" => 'Wordpress',
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
    wp_die();

    // End the request, nothing more to send
    exit();
}


function stream_chat_response($api_url, $access_token, $payload) {
    // Initialize cURL session
    $ch = curl_init($api_url);

    while (ob_get_level()) {
        ob_end_clean();
    }
    ini_set('implicit_flush', 1);
    ob_implicit_flush(1);

    // Set cURL options
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Authorization: Bearer ' . $access_token,
        'Content-Type: application/json'
    ));

    @ini_set('output_buffering', 'off');
    @ini_set('zlib.output_compression', false);
    ini_set('implicit_flush', 1);
    ob_implicit_flush(1);

    curl_setopt($ch, CURLOPT_TIMEOUT, 0); 
    curl_setopt($ch, CURLOPT_BUFFERSIZE, 16);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);  

    $buffer = '';
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($curl, $data) use (&$buffer) {
        $buffer .= $data;
        while (($pos = strpos($buffer, "\n")) !== false) {
            $line = substr($buffer, 0, $pos);
            $buffer = substr($buffer, $pos + 1);

            if (empty(trim($line))) continue;

            $jsonString = trim(preg_replace('/^data:\s*/', '', $line));
            $parsedData = json_decode($jsonString, true);

            if (isset($parsedData['s']) && $parsedData['s'] === 'meta') {
                if (isset($parsedData['state']['sources']['rag']['sources'])) {
                    $sources = $parsedData['state']['sources']['rag']['sources'];
                    $map = array();
                    foreach ($sources as $source) {
                        if (isset($source['name']) && isset($source['contentKey'])) {
                            $name = $source['name'];
                            $contentKey = $source['contentKey'];
                            $map[$name] = $contentKey;
                        }
                    }
                    // Send the map to the client
                    echo json_encode(['dataSources' => $map]) . "\n\n";
                    @ob_flush();
                    @flush();
                } 

            } elseif (isset($parsedData['d']) && is_string($parsedData['d'])) {
                echo json_encode(['message' => $parsedData['d']]) . "\n";
                @ob_flush();
                @flush();
            } elseif (isset($parsedData['type']) && $parsedData['type'] === 'end') {
                // error_log("END");
                @ob_flush();
                @flush();
                break;  // Exit the loop if the end type is received
            } else {
                // error_log(print_r($parsedData, true));
            }
        }
        @ob_flush();
        @flush();
        return strlen($data); 
    });


    // Execute the request
    curl_exec($ch);

    // Check for any cURL errors
    if (curl_errno($ch)) {
        return new WP_Error('api_error', curl_error($ch));
    }

    // Close the cURL session
    curl_close($ch);
    wp_die();
    return true;
}

