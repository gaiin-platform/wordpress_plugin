<?php

$is_dev = get_option('isDev', false);

return [
    'chat_endpoint' => $is_dev 
        ? 'https://scsoiuzshn3a5mhmkpry6yr4z40arjrr.lambda-url.us-east-1.on.aws'
        : 'https://jl3kwdj5shtwqxuqe3nj6qcxdy0wtwuy.lambda-url.us-east-1.on.aws',
    'base_api_endpoint' => $is_dev
        ? 'https://dev-api.vanderbilt.ai'
        : 'https://prod-api.vanderbilt.ai',
    'assistant_endpoint' => $is_dev
        ? 'https://dev-assistants-api.vanderbilt.ai'
        : 'https://prod-assistants-api.vanderbilt.ai',
    'avatar_image' => 'Vanderbilt-Emblem.png',
    'amplify_api_key' => get_option('amplify_api_key'),
    'assistant_name' =>  get_option('assistant_name'),
    'astgp' => get_option('astgp'),
    // 'default_model' => get_option('default_model'),
    'default_group_types_question' => get_option('default_group_types_question') ?? "Please select the group you best identify with.",
    'start_up_message' => get_option('start_up_message'),
    'typing_message' => get_option('typing_message'),
    'retry_message' => get_option('retry_message'),
    'font_size' => get_option('font_size'),
    'email_to' => get_option('email_to'), 
];
