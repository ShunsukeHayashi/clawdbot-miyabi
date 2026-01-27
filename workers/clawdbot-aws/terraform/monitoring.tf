/**
 * CloudWatch Alarms + SNS for Slack Notification
 */

# SNS Topic for Alerts
resource "aws_sns_topic" "clawdbot_alerts" {
  name = "${var.project_name}-alerts"

  tags = {
    Name = "${var.project_name}-alerts"
  }
}

# CloudWatch Log Metric Filter for Errors
resource "aws_cloudwatch_log_metric_filter" "error_filter" {
  name           = "${var.project_name}-error-filter"
  pattern        = "?ERROR ?Error ?error ?FATAL ?Fatal ?fatal"
  log_group_name = aws_cloudwatch_log_group.clawdbot.name

  metric_transformation {
    name          = "${var.project_name}-error-count"
    namespace     = "Clawdbot"
    value         = "1"
    default_value = "0"
  }
}

# CloudWatch Alarm for Errors
resource "aws_cloudwatch_metric_alarm" "error_alarm" {
  alarm_name          = "${var.project_name}-error-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "${var.project_name}-error-count"
  namespace           = "Clawdbot"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Clawdbot error count exceeded threshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.clawdbot_alerts.arn]
  ok_actions    = [aws_sns_topic.clawdbot_alerts.arn]

  tags = {
    Name = "${var.project_name}-error-alarm"
  }
}

# CloudWatch Alarm for ECS CPU
resource "aws_cloudwatch_metric_alarm" "ecs_cpu_alarm" {
  alarm_name          = "${var.project_name}-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "ECS CPU utilization high"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.clawdbot.name
    ServiceName = aws_ecs_service.clawdbot.name
  }

  alarm_actions = [aws_sns_topic.clawdbot_alerts.arn]
  ok_actions    = [aws_sns_topic.clawdbot_alerts.arn]

  tags = {
    Name = "${var.project_name}-cpu-alarm"
  }
}

# CloudWatch Alarm for ECS Memory
resource "aws_cloudwatch_metric_alarm" "ecs_memory_alarm" {
  alarm_name          = "${var.project_name}-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "MemoryUtilization"
  namespace           = "AWS/ECS"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "ECS memory utilization high"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.clawdbot.name
    ServiceName = aws_ecs_service.clawdbot.name
  }

  alarm_actions = [aws_sns_topic.clawdbot_alerts.arn]
  ok_actions    = [aws_sns_topic.clawdbot_alerts.arn]

  tags = {
    Name = "${var.project_name}-memory-alarm"
  }
}

