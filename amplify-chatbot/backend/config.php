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


function load_chat_bot_base_configuration(WP_REST_Request $request) {
    include(plugin_dir_path(__FILE__) . '/amplify-api.php');
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


