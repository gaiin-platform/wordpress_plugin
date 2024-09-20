<?php
/*
Plugin Name: Amplify
Plugin URI: https://github.com/gaiin-platform/wordpress_plugin
Description: A dynamic chatbot plugin for real-time streaming and user interaction provided by Amplify.
Version: 1.0
Author: Amplify @ Vanderbilt.edu
Author URI: https://vanderbilt.ai
*/

function amplify_chatbot_enqueue_scripts() {
    wp_enqueue_style('amplify-chatbot-style', plugins_url('/frontend/style.css', __FILE__));
    wp_enqueue_style('font-awesome', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.0/css/all.min.css');
    wp_enqueue_script('amplify-chatbot-script', plugins_url('/frontend/script.js', __FILE__), array('jquery'), null, true);

    $current_user = wp_get_current_user();
    $user_email = $current_user->exists() ? $current_user->user_email : '';
    
    wp_localize_script('amplify-chatbot-script', 'amplifyChatbotSettings', array(
        'apiUrl' => esc_url_raw(rest_url('amplify/v1')),
        'botConfigurationUrl' => esc_url_raw(rest_url('amplify/v1/chat-bot-config')),
        'nonce' => wp_create_nonce('wp_rest'),
        'assistantName' => get_option('assistant_name', 'Amplify'),
        'userEmail' => $user_email 
    ));
}
add_action('wp_enqueue_scripts', 'amplify_chatbot_enqueue_scripts');


// Load scripts only when the shortcode is present on a page
function load_amplify_chatbot_assets() {
    global $post;
    if (is_a($post, 'WP_Post') && has_shortcode($post->post_content, 'amplify_chatbot')) {
        amplify_chatbot_enqueue_scripts();
    }
}
add_action('wp', 'load_amplify_chatbot_assets');

// Shortcode to display the chatbot UI
function amplify_chatbot_shortcode() {
    $path = plugin_dir_path(__FILE__) . 'frontend/index.html';
    return file_get_contents($path);
}

add_shortcode('amplify_chatbot', 'amplify_chatbot_shortcode');

// Include backend configuration
require_once plugin_dir_path(__FILE__) . '/backend/config.php';
require_once plugin_dir_path(__FILE__) . '/backend/amplify-api.php';



// Register REST API routes for chat functionality
add_action('rest_api_init', function () {
    register_rest_route('amplify/v1', '/chat-bot-config', array(
        'methods' => 'GET',
        'callback' => 'load_chat_bot_base_configuration',
    ));

    // register_rest_route('amplify/v1', '/chat/', array(
    //     'methods' => array('GET'),
    //     'callback' => 'handle_chat_bot_request',
    //     'permission_callback' => '__return_true',
    // ));

    // register_rest_route('amplify/v1', '/chat/', array(
    //     'methods' => 'POST',
    //     'callback' => 'handle_post_request',
    //     'permission_callback' => '__return_true',  // Allows all users to access for testing
    // ));

    register_rest_route('amplify/v1', '/chat/', array(
        'methods' => array('POST'),
        'callback' => 'handle_chat_bot_request',
        'permission_callback' => '__return_true',
    ));
    
    register_rest_route('amplify/v1', '/submit-rating/', array(
        'methods' => 'POST',
        'callback' => 'handle_submit_rating_request',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('amplify/v1', '/follow-up/', array(
        'methods' => 'POST',
        'callback' => 'handle_follow_up_request',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('amplify/v1', '/email-conversation/', array(
        'methods' => 'POST',
        'callback' => 'handle_email_conversation_request',
        'permission_callback' => '__return_true',  
    ));

});



function amplify_register_settings() {
    // Register settings
    register_setting('amplify-settings-group', 'amplify_api_key');
    register_setting('amplify-settings-group', 'assistant_name');
    register_setting('amplify-settings-group', 'astgp');
    // register_setting('amplify-settings-group', 'default_model');
    register_setting('amplify-settings-group', 'default_group_types_question');
    register_setting('amplify-settings-group', 'start_up_message');
    register_setting('amplify-settings-group', 'font_size');
    register_setting('amplify-settings-group', 'email_to');
}
add_action('admin_init', 'amplify_register_settings');


// Add a 'Settings' link to the plugins list page
function amplify_plugin_settings_link($links) {
    $settings_link = '<a href="admin.php?page=amplify-settings">Settings</a>';
    array_push($links, $settings_link);
    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'amplify_plugin_settings_link');


function amplify_add_settings_page() {
    add_options_page(
        'Amplify Chatbot Settings', // Page title
        'Amplify Chatbot',          // Menu title
        'manage_options',           // Capability required to access this page
        'amplify-settings',         // Menu slug
        'amplify_render_settings_page' // Function to render the settings page
    );
}
add_action('admin_menu', 'amplify_add_settings_page');


// Render the settings page form
function amplify_render_settings_page() {
    ?>
    <div class="wrap">
        <h1>Amplify Chatbot Settings</h1>
        <form method="post" action="options.php">
            <?php
            // Output security fields for the registered setting
            settings_fields('amplify-settings-group');

            // Output setting sections and their fields
            do_settings_sections('amplify-settings-group');

            ?>
           <div style="display: flex; flex-direction: row; align-items: center;"> 
                <label style="margin-right: 10px;">* Marked as Required</label>
                <?php
                // Output save settings button
                submit_button('Save Settings', 'primary', 'submit', true, ['style' => 'margin-left: 82px;']);
                ?>
            </div>

            <table class="form-table">
                <tr valign="top">
                    <th scope="row">Email Users Can Request Follow-up To*</th>
                    <td><input type="text" name="email_to" value="<?php echo esc_attr(get_option('email_to')); ?>" /></td>
                </tr>

                <tr valign="top">
                    <th scope="row">Amplify API Key*</th>
                    <td><input type="text" name="amplify_api_key" value="<?php echo esc_attr(get_option('amplify_api_key')); ?>" /></td>
                </tr>
                <tr valign="top">
                    <th scope="row">Assistant Name*</th>
                    <td><input type="text" name="assistant_name" value="<?php echo esc_attr(get_option('assistant_name')); ?>" /></td>
                </tr>

                <tr valign="top">
                    <th scope="row">ASTGP*</th>
                    <td><input type="text" name="astgp" value="<?php echo esc_attr(get_option('astgp')); ?>" /></td>
                </tr>

                <!-- <tr valign="top">
                    <th scope="row">Default Model (If none selected in the admin interface)</th>
                    <td><input type="text" name="default_model" value="<?php echo esc_attr(get_option('default_model')); ?>" /></td>
                </tr> -->

                <tr valign="top">
                    <th scope="row">Group Types Question (If none set in the admin interface)</th>
                    <td><textarea name="default_group_types_question" rows="2" cols="50"><?php echo esc_attr(get_option('default_group_types_question')); ?></textarea></td>

                </tr>

                <tr valign="top">
                    <th scope="row">Startup Message</th>
                    <td><textarea name="start_up_message" rows="3" cols="50"><?php echo esc_attr(get_option('start_up_message')); ?></textarea></td>
                </tr>

                <tr valign="top">
                    <th scope="row">Font Size</th>
                    <td><input type="number" name="font_size" value="<?php echo esc_attr(get_option('font_size')); ?>" /></td>
                </tr>


            </table>
        </form>
    </div>
    <?php
}
