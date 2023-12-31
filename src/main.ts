import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.useGlobalPipes(new ValidationPipe());

    // swagger
    const config = new DocumentBuilder()
        .setTitle('How to Nest JS')
        .setDescription('This is the API documentation for How to Nest JS project.')
        .setVersion('1.0')
        .addTag('how to nest js')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);

    await app.listen(8000);
}

bootstrap();
