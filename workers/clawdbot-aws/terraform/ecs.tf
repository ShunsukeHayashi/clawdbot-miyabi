/**
 * ECS Fargate Configuration for Clawdbot Discord Bot
 */

# CloudWatch Log Group
resource "aws_cloudwatch_log_group" "clawdbot" {
  name              = "/ecs/${var.project_name}"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-logs"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "clawdbot" {
  name = "${var.project_name}-cluster"

  tags = {
    Name = "${var.project_name}-ecs"
  }
}

# Security Group (outbound only, no inbound needed for Discord bot)
resource "aws_security_group" "clawdbot" {
  name        = "${var.project_name}-sg"
  description = "Security group for Clawdbot ECS tasks (outbound only)"
  vpc_id      = aws_vpc.clawdbot.id

  # No ingress rules needed - Discord bot initiates outbound WebSocket connections

  # Egress (outbound) for internet access
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-sg"
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "clawdbot" {
  family                   = "${var.project_name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "${var.project_name}-container"
      image     = "${aws_ecr_repository.clawdbot.repository_url}:latest"
      cpu       = var.ecs_task_cpu
      memory    = var.ecs_task_memory
      essential = true
      command = ["sh", "-c", "mkdir -p /home/node/.clawdbot && printenv CLAWDBOT_CONFIG > /home/node/.clawdbot/clawdbot.json && node dist/entry.js gateway"]

      environment = [
        {
          name  = "NODE_OPTIONS"
          value = "--max-old-space-size=1536"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "SESSIONS_TABLE_NAME"
          value = aws_dynamodb_table.sessions.name
        },
        {
          name  = "ARTIFACTS_TABLE_NAME"
          value = aws_dynamodb_table.artifacts.name
        },
        {
          name  = "ARTIFACTS_S3_BUCKET"
          value = aws_s3_bucket.artifacts.id
        },
        {
          name  = "CLAWDBOT_SESSIONS_BASE"
          value = "/home/node/.clawdbot/sessions"
        },
        {
          name  = "CLAWDBOT_CREDENTIALS_BASE"
          value = "/home/node/.clawdbot/credentials"
        }
      ]

      secrets = [
        {
          name      = "CLAWDBOT_CONFIG"
          valueFrom = data.aws_secretsmanager_secret.clawdbot_config.arn
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.clawdbot.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
          "awslogs-create-group"  = "true"
        }
      }
    }
  ])

  tags = {
    Name = "${var.project_name}-taskdef"
  }
}

# ECS Service
resource "aws_ecs_service" "clawdbot" {
  name            = "${var.project_name}-service"
  cluster         = aws_ecs_cluster.clawdbot.id
  task_definition = aws_ecs_task_definition.clawdbot.arn
  desired_count   = var.ecs_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.clawdbot.id]
    assign_public_ip = true
  }

  tags = {
    Name = "${var.project_name}-service"
  }
}
