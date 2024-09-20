<?php

///////////////////  Configurations  /////////////////// 


function is_config_loaded($config, $required_keys) {
    
    foreach ($required_keys as $key) {
        if (empty($config[$key])) {
            return false;
        }
    }
    return true;
}


function handle_get_assistant_data_request() {
    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
    if (!is_config_loaded($config, ['assistant_endpoint', 'amplify_api_key', 'astgp'])) {
        return new WP_Error('missing_params', 'Required paramas include assistant_endpoint, amplify_api_key, astgp', array('status' => 400));
    }
    $assistant_api_url = $config['assistant_endpoint'] . "/assistant/get/system_user"; 
    $access_token = $config['amplify_api_key'];
    $assistant_id = $config['astgp'];

    
    $url = add_query_arg(array('assistantId' => $assistant_id), $assistant_api_url);

    $args = array(
        'headers' => array(
            'Authorization' => 'Bearer ' . $access_token
        )
    );

    $response = wp_remote_get($url, $args);
    if (is_wp_error($response)) {
        return new WP_Error('request_failed', 'The API request failed');
    }

    $body = wp_remote_retrieve_body($response);
    $data = json_decode($body, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        return new WP_Error('json_decode_error', 'Failed to decode JSON response');
    }

    $status = $data["statusCode"];

    if ($status !== 200) {
        return new WP_Error('request_error', 'Failed to retrieve the assistant data successfully');
    }

    return $data['body']['assistant'];

}


function load_chat_bot_base_configuration(WP_REST_Request $request) {
    $config = include(plugin_dir_path(__FILE__) . '/config-local-env.php');
  
    $assistant_data = handle_get_assistant_data_request();
    if (is_wp_error($assistant_data)) {
        return $assistant_data;
    }

    $botAvatar =  plugins_url('../assets/images/' . $config["avatar_image"], __FILE__);
    // $amplify_loader = plugins_url('../assets/gif/amplify_loader.gif', __FILE__);

    $response = array(
    'startUpMessage' => $config["start_up_message"],
    'fontSize' => $config["font_size"] ?? 16,
    'avatar' => $botAvatar,
    // 'amplifyLoader' => $amplify_loader,
    'assistantName' => $assistant_data['name'] ?? $config['assistant_name'],
    'groupId' => $assistant_data['groupId'],
    'prompt' => $assistant_data['instructions'],
    'groupTypes' => $assistant_data['group_types'],
    'groupTypeQuestions' => $assistant_data['group_type_questions'] ?? $config['default_group_types_question'],
    'model' => $assistant_data['model'], // ?? $config['default_model'],
    'disclaimer' => $assistant_data['disclaimer'] ?? ''
    );

    $response = new WP_REST_Response($response, 200);
    return $response;
}


