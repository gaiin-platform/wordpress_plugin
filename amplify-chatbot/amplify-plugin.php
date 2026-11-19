<?php
/*
Plugin Name: Amplify
Plugin URI: https://github.com/gaiin-platform/wordpress_plugin
Description: A dynamic chatbot plugin for real-time streaming and user interaction provided by Amplify.
Version: 1.0
Author: Amplify @ Vanderbilt.edu
Author URI: https://vanderbilt.ai
*/

function amplify_sanitize_checkbox($value) {
    return !empty($value) ? 1 : 0;
}

function amplify_sanitize_text_option($value) {
    return sanitize_text_field(wp_unslash($value));
}

function amplify_sanitize_page_ids($value) {
    if (is_array($value)) {
        $value = implode(',', $value);
    }

    $ids = preg_split('/[\s,]+/', (string) $value, -1, PREG_SPLIT_NO_EMPTY);
    $ids = array_map('absint', $ids);
    $ids = array_filter($ids);
    $ids = array_values(array_unique($ids));

    return implode(',', $ids);
}

function amplify_get_target_page_ids() {
    $raw = get_option('amplify_target_page_ids', '');
    if (empty($raw)) {
        return array();
    }

    $ids = preg_split('/[\s,]+/', (string) $raw, -1, PREG_SPLIT_NO_EMPTY);
    $ids = array_map('absint', $ids);
    return array_values(array_filter(array_unique($ids)));
}

function amplify_chatbot_is_allowed_page($post_id = null) {
    if (is_admin()) {
        return false;
    }

    if (!get_option('isVisible', 0)) {
        return false;
    }

    if (!is_singular('page')) {
        return false;
    }

    $post_id = $post_id ? absint($post_id) : get_queried_object_id();
    if (!$post_id) {
        return false;
    }

    $target_ids = amplify_get_target_page_ids();
    if (empty($target_ids)) {
        return false;
    }

    $mode = get_option('amplify_target_page_mode', 'include');
    $in_list = in_array($post_id, $target_ids, true);

    if ($mode === 'exclude') {
        return !$in_list;
    }

    return $in_list;
}

function amplify_should_enqueue_assets() {
    return amplify_chatbot_is_allowed_page();
}

function amplify_chatbot_enqueue_scripts() {
    if (!amplify_should_enqueue_assets()) {
        return;
    }

    wp_enqueue_style('amplify-chatbot-style', plugins_url('frontend/style.css', __FILE__), array(), '1.0');
    wp_enqueue_style('font-awesome', 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.1/css/all.min.css', array(), '6.2.1');
    wp_enqueue_script('marked', 'https://cdn.jsdelivr.net/npm/marked/marked.min.js', array(), null, true);
    wp_enqueue_script('dompurify', 'https://cdnjs.cloudflare.com/ajax/libs/dompurify/2.3.8/purify.min.js', array(), '2.3.8', true);
    wp_enqueue_script('amplify-chatbot-script', plugins_url('frontend/script.js', __FILE__), array('jquery', 'marked', 'dompurify'), '1.0', true);

    $current_user = wp_get_current_user();
    $user_email = $current_user->exists() ? $current_user->user_email : '';

    wp_localize_script('amplify-chatbot-script', 'amplifyChatbotSettings', array(
        'apiUrl' => esc_url_raw(rest_url('amplify/v1')),
        'botConfigurationUrl' => esc_url_raw(rest_url('amplify/v1/chat-bot-config')),
        'nonce' => wp_create_nonce('wp_rest'),
        'assistantName' => get_option('assistant_name', 'Amplify'),
        'isVisible' => (bool) get_option('isVisible', 0),
        'shouldRender' => true,
        'userEmail' => $user_email,
        'pluginUrl' => plugin_dir_url(__FILE__),
    ));
}
add_action('wp_enqueue_scripts', 'amplify_chatbot_enqueue_scripts');

// Image URL from a Media Library attachment option, or the bundled fallback asset.
// Attachment is served at 'medium' (max 300px) which stays sharp at the displayed sizes (90px / 56px, incl. 2x screens).
function amplify_get_image_url($option_name, $fallback_file) {
    $attachment_id = absint(get_option($option_name, 0));
    if ($attachment_id) {
        $url = wp_get_attachment_image_url($attachment_id, 'medium');
        if ($url) {
            return $url;
        }
    }
    return plugins_url('assets/images/' . $fallback_file, __FILE__);
}

function amplify_chatbot_markup() {
    if (!amplify_should_enqueue_assets()) {
        return '';
    }

    $path = plugin_dir_path(__FILE__) . 'frontend/index.html';
    $html = file_get_contents($path);
    if ($html === false) {
        return '';
    }

    $html = str_replace('/wp-content/plugins/amplify-chatbot/', plugin_dir_url(__FILE__), $html);
    return str_replace('{{AMPLIFY_LAUNCHER_IMAGE}}', esc_url(amplify_get_image_url('amplify_launcher_image_id', 'Quincy.png')), $html);
}

// Render directly before </body> so no theme ancestor (sticky nav, overflow, transform)
// can create a stacking context that hides the chatbot.
function amplify_chatbot_render_in_footer() {
    echo amplify_chatbot_markup(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- trusted plugin template
}
add_action('wp_footer', 'amplify_chatbot_render_in_footer', 100);

// Legacy shortcode: markup now lives in the footer, so output nothing in content
// (prevents a duplicate chatbot and raw shortcode text on existing pages).
add_shortcode('amplify_chatbot', '__return_empty_string');

// Include backend configuration
require_once plugin_dir_path(__FILE__) . '/backend/config.php';
require_once plugin_dir_path(__FILE__) . '/backend/amplify-api.php';

// Register REST API routes for chat functionality
add_action('rest_api_init', function () {
    register_rest_route('amplify/v1', '/chat-bot-config', array(
        'methods' => 'GET',
        'callback' => 'load_chat_bot_base_configuration',
    ));

    register_rest_route('amplify/v1', '/chat/', array(
        'methods' => array('POST'),
        'callback' => 'handle_chat_bot_request',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('amplify/v1', '/fetch-presigned-url/', array(
        'methods' => 'POST',
        'callback' => 'handle_fetch_presigned_url_request',
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
    register_setting('amplify-settings-group', 'isVisible', array(
        'type' => 'boolean',
        'default' => false,
        'sanitize_callback' => 'amplify_sanitize_checkbox',
    ));
    register_setting('amplify-settings-group', 'amplify_api_key', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'assistant_name', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'astgp', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'typing_message', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'retry_message', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'default_group_types_question', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'start_up_message', array(
        'sanitize_callback' => 'amplify_sanitize_text_option',
    ));
    register_setting('amplify-settings-group', 'font_size', array(
        'sanitize_callback' => 'absint',
    ));
    register_setting('amplify-settings-group', 'email_to', array(
        'sanitize_callback' => 'sanitize_email',
    ));
    register_setting('amplify-settings-group', 'isDev', array(
        'type' => 'boolean',
        'default' => false,
        'sanitize_callback' => 'amplify_sanitize_checkbox',
    ));
    register_setting('amplify-settings-group', 'amplify_launcher_image_id', array(
        'sanitize_callback' => 'absint',
    ));
    register_setting('amplify-settings-group', 'amplify_avatar_image_id', array(
        'sanitize_callback' => 'absint',
    ));
    register_setting('amplify-settings-group', 'amplify_target_page_mode', array(
        'sanitize_callback' => function ($value) {
            return in_array($value, array('include', 'exclude'), true) ? $value : 'include';
        },
    ));
    register_setting('amplify-settings-group', 'amplify_target_page_ids', array(
        'sanitize_callback' => 'amplify_sanitize_page_ids',
    ));
}
add_action('admin_init', 'amplify_register_settings');

function amplify_plugin_settings_link($links) {
    $settings_link = '<a href="admin.php?page=amplify-settings">Settings</a>';
    array_push($links, $settings_link);
    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'amplify_plugin_settings_link');

function amplify_add_settings_page() {
    add_options_page(
        'Amplify Chatbot Settings',
        'Amplify Chatbot',
        'manage_options',
        'amplify-settings',
        'amplify_render_settings_page'
    );
}
add_action('admin_menu', 'amplify_add_settings_page');

function amplify_admin_enqueue_media($hook) {
    if ($hook !== 'settings_page_amplify-settings') {
        return;
    }
    wp_enqueue_media();
}
add_action('admin_enqueue_scripts', 'amplify_admin_enqueue_media');

function amplify_render_image_field($option_name, $fallback_file, $max_preview_px) {
    $id = absint(get_option($option_name, 0));
    $preview = amplify_get_image_url($option_name, $fallback_file);
    ?>
    <div class="amplify-image-field" data-fallback="<?php echo esc_url(plugins_url('assets/images/' . $fallback_file, __FILE__)); ?>">
        <input type="hidden" name="<?php echo esc_attr($option_name); ?>" value="<?php echo esc_attr($id); ?>" class="amplify-image-id" />
        <img src="<?php echo esc_url($preview); ?>" class="amplify-image-preview" style="max-width: <?php echo (int) $max_preview_px; ?>px; height: auto; display: block; margin-bottom: 8px; background: #f0f0f1;" alt="" />
        <button type="button" class="button amplify-image-select">Choose image</button>
        <button type="button" class="button amplify-image-reset" <?php echo $id ? '' : 'style="display:none;"'; ?>>Reset to default</button>
    </div>
    <?php
}

function amplify_render_settings_page() {
    $target_mode = get_option('amplify_target_page_mode', 'include');
    $target_ids = get_option('amplify_target_page_ids', '');
    ?>
    <div class="wrap">
        <h1>Amplify Chatbot Settings</h1>
        <form method="post" action="options.php">
            <?php
            settings_fields('amplify-settings-group');
            do_settings_sections('amplify-settings-group');
            wp_nonce_field('amplify-settings-group-options');
            ?>
            <div style="display: flex; flex-direction: row; align-items: center;">
                <label style="margin-right: 10px;">* Marked as Required</label>
                <?php submit_button('Save Settings', 'primary', 'submit', true, array('style' => 'margin-left: 82px;')); ?>
            </div>

            <table class="form-table">
                <tr valign="top">
                    <th scope="row">Display Assistant On Site</th>
                    <td>
                        <input type="checkbox" name="isVisible" value="1" <?php checked(get_option('isVisible'), 1); ?> />
                    </td>
                </tr>

                <tr valign="top">
                    <th scope="row">Show On Pages</th>
                    <td>
                        <select name="amplify_target_page_mode">
                            <option value="include" <?php selected($target_mode, 'include'); ?>>Include only these pages</option>
                            <option value="exclude" <?php selected($target_mode, 'exclude'); ?>>Exclude these pages</option>
                        </select>
                        <p class="description">Enter WordPress page IDs separated by commas or spaces.</p>
                    </td>
                </tr>

                <tr valign="top">
                    <th scope="row">Page IDs</th>
                    <td>
                        <textarea name="amplify_target_page_ids" rows="3" cols="50" placeholder="12, 34, 56"><?php echo esc_textarea($target_ids); ?></textarea>
                    </td>
                </tr>

                <tr valign="top">
                    <th scope="row">Chat Launcher Image</th>
                    <td>
                        <?php amplify_render_image_field('amplify_launcher_image_id', 'Quincy.png', 90); ?>
                        <p class="description">The floating image that opens the chat. Displayed at 90px wide; the aspect ratio is kept. Default: Quincy.</p>
                    </td>
                </tr>

                <tr valign="top">
                    <th scope="row">Assistant Message Image</th>
                    <td>
                        <?php amplify_render_image_field('amplify_avatar_image_id', 'Vanderbilt-Emblem.png', 56); ?>
                        <p class="description">Shown beside each assistant message. Displayed at 56px wide; the aspect ratio is kept. Default: Vanderbilt emblem.</p>
                    </td>
                </tr>

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

                <tr valign="top">
                    <th scope="row">Startup Message</th>
                    <td><textarea name="start_up_message" rows="3" cols="50"><?php echo esc_attr(get_option('start_up_message')); ?></textarea></td>
                </tr>

                <tr valign="top">
                    <th scope="row">Group Types Question (If none set in the admin interface)</th>
                    <td><textarea name="default_group_types_question" rows="2" cols="50"><?php echo esc_attr(get_option('default_group_types_question')); ?></textarea></td>
                </tr>

                <tr valign="top">
                    <th scope="row">On typing message</th>
                    <td><textarea name="typing_message" rows="1" cols="50"><?php echo esc_attr(get_option('typing_message')); ?></textarea></td>
                </tr>

                <tr valign="top">
                    <th scope="row">On chat fail, retry message</th>
                    <td><textarea name="retry_message" rows="1" cols="50"><?php echo esc_attr(get_option('retry_message')); ?></textarea></td>
                </tr>

                <tr valign="top">
                    <th scope="row">Font Size</th>
                    <td><input type="number" name="font_size" value="<?php echo esc_attr(get_option('font_size')); ?>" /></td>
                </tr>

                <tr valign="top">
                    <th scope="row">Check this box if running in Amplify Dev</th>
                    <td>
                        <input type="checkbox" name="isDev" value="1" <?php checked(get_option('isDev'), 1); ?> />
                    </td>
                </tr>
            </table>
        </form>
    </div>
    <script>
    jQuery(function ($) {
        $('.amplify-image-field').each(function () {
            var $f = $(this), frame;
            var $id = $f.find('.amplify-image-id'), $img = $f.find('.amplify-image-preview'), $reset = $f.find('.amplify-image-reset');
            $f.find('.amplify-image-select').on('click', function () {
                if (!frame) {
                    frame = wp.media({ title: 'Choose image', button: { text: 'Use this image' }, library: { type: 'image' }, multiple: false });
                    frame.on('select', function () {
                        var a = frame.state().get('selection').first().toJSON();
                        $id.val(a.id);
                        $img.attr('src', (a.sizes && a.sizes.medium) ? a.sizes.medium.url : a.url);
                        $reset.show();
                    });
                }
                frame.open();
            });
            $reset.on('click', function () {
                $id.val('');
                $img.attr('src', $f.data('fallback'));
                $reset.hide();
            });
        });
    });
    </script>
    <?php
}
